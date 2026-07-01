import type { Modalidade, Rodada } from '../types';

/** Cores e identidade visual dos embeds. */
export const THEME = {
  primary: '#5B4B8A',
  accent: '#D4C5A0',
};

export type LeagueBranding = {
  nome: string;
  temporada: string;
  label: string;
  logo: string;
  emoji: string;
  fases?: string[];
};

export const LEAGUE: LeagueBranding = {
  nome: 'Brasileirão - Série A',
  temporada: '2026',
  label: 'Brasileirão - Série A 2026',
  logo: 'https://cdn.api-futebol.com.br/campeonatos/escudos/campeonato-brasileiro.png',
  emoji: '🏆',
};

export const COPA: LeagueBranding = {
  nome: 'Copa do Mundo',
  temporada: '2026',
  label: 'Copa do Mundo 2026 · Bolão CHZ',
  logo: 'https://cdn.api-futebol.com.br/campeonatos/escudos/copa-do-mundo.png',
  emoji: '🌍',
  fases: [
    'Fase de Grupos',
    'Segunda Fase',
    'Oitavas de Final',
    'Quartas de Final',
    'Semi Final',
    'Disputa 3o lugar',
    'Final',
  ],
};

export function leagueBranding(modalidade?: Modalidade | null): LeagueBranding {
  return modalidade === 'copa' ? COPA : LEAGUE;
}

export function leagueBrandingForRodada(rodada?: Rodada | null): LeagueBranding {
  return leagueBranding(rodada?.modalidade);
}

export function labelFaseCopa(numeroFase: number): string {
  const idx = numeroFase - 1;
  return COPA.fases?.[idx] ?? `Fase ${numeroFase}`;
}

export function tituloRodada(rodada?: Pick<Rodada, 'modalidade' | 'numero_rodada'> | null): string {
  if (rodada?.modalidade === 'copa') {
    return labelFaseCopa(rodada.numero_rodada);
  }
  return `${rodada?.numero_rodada ?? '?'}ª RODADA`;
}
