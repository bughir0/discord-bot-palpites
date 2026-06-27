export type BulkPointEntry = {
  userId: string;
  amount: number;
};

const SNOWFLAKE = /^\d{17,20}$/;
const MENTION = /^<@!?(\d{17,20})>$/;
const PAIR = /^(\d{17,20})\s*[:=]\s*(\d+)$/;
const ID_ONLY = /^(\d{17,20})$/;

/** Extrai ID Discord de menção, ID puro ou par id:quantidade. */
export function parseBulkPointsInput(
  raw: string,
  defaultAmount: number,
): { entries: BulkPointEntry[]; errors: string[] } {
  const errors: string[] = [];
  const map = new Map<string, number>();

  const chunks = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    return { entries: [], errors: ['Nenhum usuário informado.'] };
  }

  if (defaultAmount < 1) {
    return { entries: [], errors: ['Quantidade padrão deve ser ≥ 1.'] };
  }

  for (const chunk of chunks) {
    let userId: string | null = null;
    let amount = defaultAmount;

    const mentionOnly = chunk.match(MENTION);
    if (mentionOnly) {
      userId = mentionOnly[1];
    } else {
      const mentionWithQty = chunk.match(/^<@!?(\d{17,20})>\s*[:=]?\s*(\d+)$/);
      if (mentionWithQty) {
        userId = mentionWithQty[1];
        amount = Number(mentionWithQty[2]);
      } else {
        const pair = chunk.match(PAIR);
        if (pair) {
          userId = pair[1];
          amount = Number(pair[2]);
        } else {
          const idOnly = chunk.match(ID_ONLY);
          if (idOnly) {
            userId = idOnly[1];
          }
        }
      }
    }

    if (!userId || !SNOWFLAKE.test(userId)) {
      errors.push(`Entrada inválida: "${chunk}"`);
      continue;
    }
    if (!Number.isInteger(amount) || amount < 1) {
      errors.push(`Quantidade inválida para ${userId}: ${amount}`);
      continue;
    }

    const prev = map.get(userId);
    map.set(userId, prev != null ? prev + amount : amount);
  }

  const entries = [...map.entries()].map(([userId, amount]) => ({ userId, amount }));
  return { entries, errors };
}
