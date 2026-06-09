import { env, API_BASE_URL } from '../config';
import type { CampeonatoApi, RodadaApi, RodadaGruposApi } from '../types';
import { canUseApi, getApiUsageToday, registerApiRequest } from './apiQuota';
import { partidaAbertaParaPalpite } from './pontuacao';
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

/** Copa 2026 e torneios mistos não preenchem campeonato.rodada_atual. */
async function inferirRodadaAtualPorCalendario(campeonatoId: number): Promise<number | null> {
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
  const raw = await apiFetch<RodadaApi | RodadaGruposApi>(
    `/campeonatos/${campeonatoId}/rodadas/${numeroRodada}`,
  );
  return normalizarRodadaApi(raw, numeroRodada);
}

export async function buscarRodadaAtual(campeonatoId: number): Promise<number | null> {
  const campeonato = await buscarCampeonato(campeonatoId);
  if (campeonato.rodada_atual?.rodada != null) {
    return campeonato.rodada_atual.rodada;
  }
  return inferirRodadaAtualPorCalendario(campeonatoId);
}

export { getApiUsageToday };
