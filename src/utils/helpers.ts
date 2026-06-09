import { THEME } from '../embeds/theme';

export const COLORS = {
  primary: 0x5b4b8a,
  accent: 0xd4c5a0,
  error: 0xed4245,
};

export function parseEmbedColor(hex: string): number {
  const cleaned = hex.replace('#', '');
  const parsed = Number.parseInt(cleaned, 16);
  return Number.isNaN(parsed) ? COLORS.primary : parsed;
}

export function medal(position: number): string {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return `\`#${String(position).padStart(2, '0')}\``;
}

export function rankBadge(position: number): string {
  return `\`#${String(position).padStart(2, '0')}\``;
}

export function resultadoEmoji(tipo: 'exato' | 'vencedor' | 'erro'): string {
  switch (tipo) {
    case 'exato':
      return '🎯';
    case 'vencedor':
      return '✅';
    case 'erro':
      return '❌';
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Data a definir';
  const date = new Date(iso);
  return date.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/** Unix timestamp (segundos) para uso em embeds e lógica */
export function toUnixTimestamp(iso: string | null): number | null {
  if (!iso) return null;
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isNaN(unix) ? null : unix;
}

/** Estilos do `<t:unix:estilo>` do Discord */
export type DiscordTimestampStyle = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';

export function formatDiscordTimestamp(
  iso: string | null,
  style: DiscordTimestampStyle = 'F',
): string {
  const unix = toUnixTimestamp(iso);
  if (unix === null) return 'Data a definir';
  return `<t:${unix}:${style}>`;
}

/** Data completa + contagem relativa (ex.: "24 de maio…" e "em 3 dias") */
export function formatDiscordTimestampFull(iso: string | null): string {
  const unix = toUnixTimestamp(iso);
  if (unix === null) return 'Data a definir';
  return `${formatDiscordTimestamp(iso, 'F')} (${formatDiscordTimestamp(iso, 'R')})`;
}

export function formatEstadio(estadio: string | null | undefined): string {
  if (!estadio) return '_Local a definir_';
  return `*${estadio}, Brazil*`;
}

export function defaultEmbedColor(customHex?: string): number {
  return parseEmbedColor(customHex ?? THEME.primary);
}

export function accentEmbedColor(): number {
  return COLORS.accent;
}
