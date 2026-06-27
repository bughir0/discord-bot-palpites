/** Espelha a regra do bot: só jogo agendado e antes do horário de início. */
export function partidaAbertaParaPalpite(
  status: string,
  dataIso: string | null,
  processada = false,
): boolean {
  if (processada) return false;
  if (status !== "agendado") return false;
  if (dataIso) {
    const kickoff = new Date(dataIso).getTime();
    if (!Number.isNaN(kickoff) && kickoff <= Date.now()) return false;
  }
  return true;
}