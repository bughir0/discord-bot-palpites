import { env, API_BASE_URL } from '../config';
import type { CampeonatoApi, FaseDetailApi, FaseMetaApi, PartidaApi, RodadaApi, RodadaGruposApi } from '../types';
import { canUseApi, getApiUsageToday, registerApiRequest } from './apiQuota';
import { partidaAbertaParaPalpite } from './pontuacao';
import { COPA } from '../embeds/theme';
import { log } from '../utils/logger';

export class ApiFutebolError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiFutebolError';
  }
}

/** Pausa chamadas após HTTP 429 (limite ~100 req/dia no plano gratuito) */
let quotaExhaustedUntil = 0;
let quotaWarned = false;

export function isApiQuotaExhausted(): boolean {
  return Date.now() < quotaExhaustedUntil || !canUseApi();
}

function markApiQuotaExhausted(): void {
  quotaExhaustedUntil = Date.now() + 24 * 60 * 60 * 1000;
  if (!quotaWarned) {
    quotaWarned = true;
    const { count, limit } = getApiUsageToday();
    log.warn(`API Futebol: limite diário (${count}/${limit} req). Verificações pausadas até amanhã.`);
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

async function apiFetch<T>(path: string): Promise<T> {
  if (isApiQuotaExhausted()) {
    const { count, limit } = getApiUsageToday();
    throw new ApiFutebolError(
      `API Futebol: limite diário atingido (${count}/${limit} requisições). Tente amanhã.`,
      429,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${env.apiFutebolKey}` },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 429) markApiQuotaExhausted();
      throw new ApiFutebolError(
        `API Futebol erro ${response.status}: ${body || response.statusText}`,
        response.status,
      );
    }

    registerApiRequest();
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function isRodadaGruposApi(data: RodadaApi | RodadaGruposApi): data is RodadaGruposApi {
  return !Array.isArray((data as RodadaApi).partidas);
}

/** Normaliza resposta por grupos (Copa) para o formato RodadaApi usado no bot. */
function normalizarRodadaApi(
  data: RodadaApi | RodadaGruposApi,
  numeroRodada: number,
): RodadaApi {
  if (!isRodadaGruposApi(data)) {
    return data;
  }

  const partidas: RodadaApi['partidas'] = [];
  let nome = `${numeroRodada}ª Rodada`;
  let slug = `${numeroRodada}a-rodada`;
  let status = 'agendada';

  for (const blocos of Object.values(data)) {
    if (!Array.isArray(blocos)) continue;
    for (const bloco of blocos) {
      if (bloco.rodada !== numeroRodada) continue;
      nome = bloco.nome ?? nome;
      slug = bloco.slug ?? slug;
      status = bloco.status ?? status;
      partidas.push(...(bloco.partidas ?? []));
    }
  }

  return { nome, slug, rodada: numeroRodada, status, partidas };
}

export function isCopaCampeonato(campeonatoId: number): boolean {
  return env.copaCampeonatoId != null && campeonatoId === env.copaCampeonatoId;
}

function partidaComTimesDefinidos(partida: PartidaApi | undefined): boolean {
  const mandante = partida?.time_mandante;
  const visitante = partida?.time_visitante;
  if (!mandante || !visitante) return false;
  if (mandante.time_id == null || visitante.time_id == null) return false;
  return true;
}

function extrairPartidasFase(fase: FaseDetailApi): PartidaApi[] {
  const out: PartidaApi[] = [];
  const seen = new Set<number>();
  const push = (partida: PartidaApi | undefined) => {
    if (!partida?.partida_id || seen.has(partida.partida_id)) return;
    if (!partidaComTimesDefinidos(partida)) return;
    seen.add(partida.partida_id);
    out.push(partida);
  };

  if (fase.grupos && typeof fase.grupos === 'object' && !Array.isArray(fase.grupos)) {
    for (const grupo of Object.values(fase.grupos)) {
      if (!grupo?.partidas || typeof grupo.partidas !== 'object') continue;
      for (const rodadaPartidas of Object.values(grupo.partidas)) {
        if (Array.isArray(rodadaPartidas)) rodadaPartidas.forEach(push);
      }
    }
  }
  if (Array.isArray(fase.chaves)) {
    for (const chave of fase.chaves) {
      push(chave.partida_ida);
      if (Array.isArray(chave.partida_volta)) chave.partida_volta.forEach(push);
      else push(chave.partida_volta);
    }
  }
  if (Array.isArray(fase.rodadas)) {
    for (const rodada of fase.rodadas) {
      (rodada.partidas ?? []).forEach(push);
    }
  }
  return out;
}

function montarRodadaApiCopa(faseDetail: FaseDetailApi, numeroFase: number, partidas: PartidaApi[]): RodadaApi {
  return {
    nome: faseDetail.nome,
    slug: faseDetail.slug,
    rodada: numeroFase,
    status: faseDetail.status ?? 'agendada',
    partidas,
    faseId: faseDetail.fase_id,
  };
}

const fasesCopaCache = new Map<number, { fases: FaseMetaApi[]; at: number }>();
const FASES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function buscarFasesComCache(campeonatoId: number): Promise<FaseMetaApi[]> {
  const cached = fasesCopaCache.get(campeonatoId);
  if (cached && Date.now() - cached.at < FASES_CACHE_TTL_MS) {
    return cached.fases;
  }
  const fases = await buscarFases(campeonatoId);
  fasesCopaCache.set(campeonatoId, { fases, at: Date.now() });
  return fases;
}

function numeroFasePorFaseId(fases: FaseMetaApi[], faseId: number): number | null {
  const idx = fases.findIndex((f) => f.fase_id === faseId);
  return idx >= 0 ? idx + 1 : null;
}

function numeroFasePorNome(nome: string): number | null {
  const idx = COPA.fases?.findIndex((f) => f === nome) ?? -1;
  return idx >= 0 ? idx + 1 : null;
}

export async function buscarFases(campeonatoId: number): Promise<FaseMetaApi[]> {
  const data = await apiFetch<FaseMetaApi[] | unknown>(`/campeonatos/${campeonatoId}/fases`);
  return Array.isArray(data) ? data : [];
}

export async function buscarFase(campeonatoId: number, faseId: number): Promise<FaseDetailApi> {
  return apiFetch<FaseDetailApi>(`/campeonatos/${campeonatoId}/fases/${faseId}`);
}

export async function buscarRodadaCopa(campeonatoId: number, numeroFase: number): Promise<RodadaApi> {
  const fases = await buscarFasesComCache(campeonatoId);
  const meta = fases[numeroFase - 1];
  if (!meta) {
    throw new ApiFutebolError(`Fase ${numeroFase} não encontrada na Copa.`, 404);
  }
  const detail = await buscarFase(campeonatoId, meta.fase_id);
  const partidas = extrairPartidasFase(detail);
  return montarRodadaApiCopa(detail, numeroFase, partidas);
}

async function buscarFaseAtualCopa(
  campeonatoId: number,
): Promise<{ numeroFase: number; detail: FaseDetailApi } | null> {
  const campeonato = await buscarCampeonato(campeonatoId);
  const faseAtual = campeonato.fase_atual;
  if (!faseAtual?.fase_id) return null;

  let numeroFase = faseAtual.nome ? numeroFasePorNome(faseAtual.nome) : null;
  if (numeroFase == null) {
    const fases = await buscarFasesComCache(campeonatoId);
    numeroFase = numeroFasePorFaseId(fases, faseAtual.fase_id);
  }
  if (numeroFase == null) return null;

  const detail = await buscarFase(campeonatoId, faseAtual.fase_id);
  return { numeroFase, detail };
}

function faseStatusAbrivel(status: string | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  const bloqueados = [
    'finalizado',
    'finalizada',
    'encerrado',
    'encerrada',
    'aguardando-resultados',
    'aguardando',
  ];
  return !bloqueados.includes(s);
}

export type FaseCopaDisponivel = {
  numeroFase: number;
  faseId: number;
  nome: string;
  slug: string;
  rodadaApi: RodadaApi;
};

export async function listarFasesCopaDisponiveis(campeonatoId: number): Promise<FaseCopaDisponivel[]> {
  const atual = await buscarFaseAtualCopa(campeonatoId);
  if (!atual || !faseStatusAbrivel(atual.detail.status)) {
    return [];
  }
  const { numeroFase, detail } = atual;
  const partidas = extrairPartidasFase(detail);
  const elegiveis = partidas.filter((p) => partidaAbertaParaPalpite(p.status, p.data_realizacao_iso));
  if (elegiveis.length === 0) return [];
  return [
    {
      numeroFase,
      faseId: detail.fase_id,
      nome: detail.nome,
      slug: detail.slug,
      rodadaApi: montarRodadaApiCopa(detail, numeroFase, elegiveis),
    },
  ];
}

/** Copa 2026 e torneios mistos não preenchem campeonato.rodada_atual. */
async function inferirRodadaAtualPorCalendario(campeonatoId: number): Promise<number | null> {
  if (isCopaCampeonato(campeonatoId)) {
    const atual = await buscarFaseAtualCopa(campeonatoId);
    return atual?.numeroFase ?? null;
  }
  const MAX_RODADAS = 8;
  let ultimaComJogos: number | null = null;

  for (let n = 1; n <= MAX_RODADAS; n++) {
    let rodada: RodadaApi;
    try {
      rodada = await buscarRodada(campeonatoId, n);
    } catch (err) {
      if (err instanceof ApiFutebolError && err.status === 404) break;
      throw err;
    }

    if (rodada.partidas.length === 0) break;

    ultimaComJogos = n;
    const temJogoAberto = rodada.partidas.some((p) =>
      partidaAbertaParaPalpite(p.status, p.data_realizacao_iso),
    );
    if (temJogoAberto) return n;
  }

  return ultimaComJogos;
}

export async function buscarCampeonato(campeonatoId: number): Promise<CampeonatoApi> {
  return apiFetch<CampeonatoApi>(`/campeonatos/${campeonatoId}`);
}

export async function buscarRodada(
  campeonatoId: number,
  numeroRodada: number,
): Promise<RodadaApi> {
  if (isCopaCampeonato(campeonatoId)) {
    return buscarRodadaCopa(campeonatoId, numeroRodada);
  }
  const raw = await apiFetch<RodadaApi | RodadaGruposApi>(
    `/campeonatos/${campeonatoId}/rodadas/${numeroRodada}`,
  );
  return normalizarRodadaApi(raw, numeroRodada);
}

export async function buscarRodadaAtual(campeonatoId: number): Promise<number | null> {
  if (isCopaCampeonato(campeonatoId)) {
    return inferirRodadaAtualPorCalendario(campeonatoId);
  }
  const campeonato = await buscarCampeonato(campeonatoId);
  if (campeonato.rodada_atual?.rodada != null) {
    return campeonato.rodada_atual.rodada;
  }
  return inferirRodadaAtualPorCalendario(campeonatoId);
}

export { getApiUsageToday };
