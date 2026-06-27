import type { ParticipantRow } from "../models/types";
import type { ParticipationBuckets } from "../models/types";

/**
 * Agrupa participantes nas três categorias solicitadas.
 */
export function buildParticipationBuckets(rows: ParticipantRow[]): ParticipationBuckets {
  const buttonOnly: string[] = [];
  const messageOnly: string[] = [];
  const both: string[] = [];
  for (const p of rows) {
    const hasButton = p.clicked_button_at != null;
    const hasMessages = p.message_count > 0;
    if (hasButton && hasMessages) both.push(p.user_id);
    else if (hasButton) buttonOnly.push(p.user_id);
    else if (hasMessages) messageOnly.push(p.user_id);
  }
  return { buttonOnly, messageOnly, both };
}

export function totalMessages(rows: ParticipantRow[]): bigint {
  let t = 0n;
  for (const p of rows) t += BigInt(p.message_count);
  return t;
}
