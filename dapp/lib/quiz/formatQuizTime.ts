export function clampQuizSeconds(value: number, min = 5, max = 300): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** Ex.: 35 → "35s", 90 → "1m 30s" */
export function formatQuizTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

/** Display central do relógio: 35/seg ou 1:30/min */
export function formatQuizTimeDigital(seconds: number): { main: string; sub: string } {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return { main: String(s), sub: "seg" }
  const m = Math.floor(s / 60)
  const r = s % 60
  return { main: `${m}:${String(r).padStart(2, "0")}`, sub: "min" }
}
