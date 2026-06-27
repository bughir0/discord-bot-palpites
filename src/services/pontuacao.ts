import type { GuildConfig, PartidaRodada, ResultadoPalpite } from '../types';
import type { Palpite } from '../types';

export type TipoAcerto = 'exato' | 'vencedor' | 'erro';

export function calcularPontos(
  palpiteMandante: number,
  palpiteVisitante: number,
  placarMandante: number,
  placarVisitante: number,
  config: Pick<GuildConfig, 'pontos_exato' | 'pontos_vencedor'>,
): { pontos: number; tipo: TipoAcerto } {
  if (
    palpiteMandante === placarMandante &&
    palpiteVisitante === placarVisitante
  ) {
    return { pontos: config.pontos_exato, tipo: 'exato' };
  }

  const resultadoPalpite = Math.sign(palpiteMandante - palpiteVisitante);
  const resultadoReal = Math.sign(placarMandante - placarVisitante);

  if (resultadoPalpite === resultadoReal) {
    return { pontos: config.pontos_vencedor, tipo: 'vencedor' };
  }

  return { pontos: 0, tipo: 'erro' };
}

export function avaliarPalpite(
  palpite: Palpite,
  partida: PartidaRodada,
  config: Pick<GuildConfig, 'pontos_exato' | 'pontos_vencedor'>,
): ResultadoPalpite {
  const placarMandante = partida.placar_mandante ?? 0;
  const placarVisitante = partida.placar_visitante ?? 0;

  const { pontos, tipo } = calcularPontos(
    palpite.palpite_mandante,
    palpite.palpite_visitante,
    placarMandante,
    placarVisitante,
    config,
  );

  return { palpite, partida, pontos, tipo };
}

/** API pode demorar a trocar andamento → finalizado; aceita placar após ~105 min do jogo */
export function partidaComResultadoDisponivel(
  status: string,
  dataIso: string | null,
  placarMandante: number | null,
  placarVisitante: number | null,
): boolean {
  if (status === 'finalizado') return true;
  return (
    status === 'andamento' &&
    placarMandante !== null &&
    placarVisitante !== null &&
    partidaProntaParaVerificar(dataIso)
  );
}

export function partidaAbertaParaPalpite(
  status: string,
  dataIso: string | null,
  processada?: boolean | number,
): boolean {
  if (processada) return false;
  if (status !== 'agendado') return false;
  if (dataIso) {
    const kickoff = new Date(dataIso).getTime();
    if (!Number.isNaN(kickoff) && kickoff <= Date.now()) return false;
  }
  return true;
}

/** Só consulta a API depois do horário do jogo + ~105 min (evita gastar cota à toa) */
const MINUTOS_APOS_INICIO_PARA_VERIFICAR = 105;

export function partidaJaIniciou(dataIso: string | null): boolean {
  if (!dataIso) return true;
  const kickoff = new Date(dataIso).getTime();
  if (Number.isNaN(kickoff)) return true;
  return Date.now() >= kickoff;
}

export function formatMotivoPendencia(partida: PartidaRodada): string {
  const jogo = `**${partida.time_mandante} × ${partida.time_visitante}**`;
  const placar =
    partida.placar_mandante !== null && partida.placar_visitante !== null
      ? ` (${partida.placar_mandante}×${partida.placar_visitante})`
      : '';

  if (!partidaJaIniciou(partida.data_realizacao_iso)) {
    const hora = partida.hora_realizacao ?? partida.data_realizacao ?? '?';
    return `• ${jogo} — _agendado_ (início ${hora})`;
  }

  if (partida.status === 'agendado') {
    return `• ${jogo} — _agendado_ na API (horário já passou; pode estar adiado)`;
  }

  if (partida.status === 'andamento' && !partidaProntaParaVerificar(partida.data_realizacao_iso)) {
    return `• ${jogo}${placar} — _em andamento_ (publicação automática ~105 min após o início)`;
  }

  if (partida.status === 'andamento') {
    return `• ${jogo}${placar} — _em andamento_ na API (aguardando status **finalizado**)`;
  }

  return `• ${jogo}${placar} — _${partida.status}_`;
}

export function partidaProntaParaVerificar(dataIso: string | null): boolean {
  if (!dataIso) return false;
  const kickoff = new Date(dataIso).getTime();
  if (Number.isNaN(kickoff)) return false;
  return Date.now() >= kickoff + MINUTOS_APOS_INICIO_PARA_VERIFICAR * 60_000;
}
