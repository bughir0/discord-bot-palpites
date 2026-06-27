/** Fuso usado para exibir início do evento no nome (PT-BR). */
const DISPLAY_TIMEZONE = "America/Sao_Paulo";

/**
 * Data/hora de início legível para compor o título do evento (ex.: lista, export, embed).
 */
export function formatEventStartForTitle(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const DB_NAME_MAX = 256;

/**
 * Junta o nome base à data/hora de início (momento em que o evento é criado) e respeita o limite da coluna `name`.
 */
export function buildEventNameWithStartDate(baseName: string, startedAt: Date): string {
  const base = baseName.trim();
  const suffix = ` — ${formatEventStartForTitle(startedAt)}`;
  if (base.length + suffix.length <= DB_NAME_MAX) {
    return base + suffix;
  }
  const maxBase = DB_NAME_MAX - suffix.length;
  const cut = base.slice(0, Math.max(0, maxBase)).trimEnd();
  return `${cut}${suffix}`;
}

/** Nome base sem sufixo de data (para planilhas). */
export function eventBaseNameForSheet(fullName: string): string {
  const idx = fullName.indexOf(' — ');
  return idx >= 0 ? fullName.slice(0, idx).trim() : fullName.trim();
}

export function formatEventDateOnlyPtBr(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: DISPLAY_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}
