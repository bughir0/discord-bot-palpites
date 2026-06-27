/**
 * Quebra texto em partes dentro do limite (ex.: descrição de embed 4096).
 */
export function chunkLines(lines: string[], maxLen: number): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length <= maxLen) {
      cur = next;
    } else {
      if (cur) chunks.push(cur);
      if (line.length > maxLen) {
        for (let i = 0; i < line.length; i += maxLen) {
          chunks.push(line.slice(i, i + maxLen));
        }
        cur = "";
      } else {
        cur = line;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [""];
}

/** Formata lista de menções ou IDs para exibição. */
export function formatUserList(ids: string[], maxDisplay = 30): string {
  if (ids.length === 0) return "_Nenhum_";
  const slice = ids.slice(0, maxDisplay);
  const lines = slice.map((id) => `<@${id}>`);
  if (ids.length > maxDisplay) {
    lines.push(`_… e mais ${ids.length - maxDisplay}_`);
  }
  return lines.join("\n");
}
