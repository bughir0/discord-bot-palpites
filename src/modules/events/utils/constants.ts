/** Prefixo base dos botões de participação (Discord limita 100 caracteres no customId). */
export const BUTTON_PARTICIPATE_PREFIX = "evt:participate:";

/** Botão do anúncio: abre confirmação. */
export function buildParticipatePromptId(eventId: string): string {
  return `${BUTTON_PARTICIPATE_PREFIX}prompt:${eventId}`;
}

/** Confirma participação (mensagem ephemeral). */
export function buildParticipateConfirmId(eventId: string): string {
  return `${BUTTON_PARTICIPATE_PREFIX}confirm:${eventId}`;
}

export const PARTICIPATE_CANCEL_ID = `${BUTTON_PARTICIPATE_PREFIX}cancel`;

/** Botão do anúncio: abre confirmação para sair da dinâmica. */
export function buildLeavePromptId(eventId: string): string {
  return `${BUTTON_PARTICIPATE_PREFIX}leave:prompt:${eventId}`;
}

/** Confirma saída (ephemeral). */
export function buildLeaveConfirmId(eventId: string): string {
  return `${BUTTON_PARTICIPATE_PREFIX}leave:confirm:${eventId}`;
}

export const PARTICIPATE_LEAVE_CANCEL_ID = `${BUTTON_PARTICIPATE_PREFIX}leave:cancel`;

export type ParsedParticipateButton =
  | { kind: "prompt"; eventId: string }
  | { kind: "confirm"; eventId: string }
  | { kind: "cancel" }
  | { kind: "legacy"; eventId: string }
  | { kind: "leavePrompt"; eventId: string }
  | { kind: "leaveConfirm"; eventId: string }
  | { kind: "leaveCancel" };

/**
 * Interpreta customId dos botões de participação / saída.
 * Legacy `evt:participate:<id>` (só dígitos) é tratado como prompt de confirmação.
 */
export function parseParticipateCustomId(customId: string): ParsedParticipateButton | null {
  if (!customId.startsWith(BUTTON_PARTICIPATE_PREFIX)) return null;
  const rest = customId.slice(BUTTON_PARTICIPATE_PREFIX.length);
  if (rest === "cancel") return { kind: "cancel" };
  if (rest === "leave:cancel") return { kind: "leaveCancel" };
  if (rest.startsWith("leave:prompt:")) {
    const id = rest.slice("leave:prompt:".length);
    return /^\d+$/.test(id) ? { kind: "leavePrompt", eventId: id } : null;
  }
  if (rest.startsWith("leave:confirm:")) {
    const id = rest.slice("leave:confirm:".length);
    return /^\d+$/.test(id) ? { kind: "leaveConfirm", eventId: id } : null;
  }
  if (rest.startsWith("prompt:")) {
    const id = rest.slice("prompt:".length);
    return /^\d+$/.test(id) ? { kind: "prompt", eventId: id } : null;
  }
  if (rest.startsWith("confirm:")) {
    const id = rest.slice("confirm:".length);
    return /^\d+$/.test(id) ? { kind: "confirm", eventId: id } : null;
  }
  if (/^\d+$/.test(rest)) return { kind: "legacy", eventId: rest };
  return null;
}
