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
};

export function leagueBranding(modalidade?: Modalidade | null): LeagueBranding {
  return modalidade === 'copa' ? COPA : LEAGUE;
}

export function leagueBrandingForRodada(rodada?: Rodada | null): LeagueBranding {
  return leagueBranding(rodada?.modalidade);
}
