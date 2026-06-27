import { env } from '../../config';
import { log } from '../../utils/logger';
import { addSaldo } from './store';

export function creditCommunityPoints(
  userId: string,
  delta: number,
  source: string,
  reference?: string,
): number | null {
  if (!env.pointsEnabled || delta <= 0) return null;
  const novo = addSaldo(userId, delta, source, reference);
  log.detail(`[points] +${delta} para ${userId} (${source}${reference ? `:${reference}` : ''}) → ${novo}`);
  return novo;
}

export function rewardQuizScores(scores: Map<string, number>): void {
  if (!env.pointsEnabled) return;
  const perPoint = env.pointsQuizPerCorrect;
  for (const [userId, quizPts] of scores) {
    if (quizPts > 0) {
      creditCommunityPoints(userId, quizPts * perPoint, 'quiz', String(quizPts));
    }
  }
}

export type QuizFinishRewardResult = {
  top3Points: number;
  othersPoints: number;
  top3: { userId: string; quizPts: number; saldo: number }[];
  others: { userId: string; saldo: number }[];
};

/** Top 3 do ranking e demais participantes recebem os valores informados. */
export function rewardQuizFinish(input: {
  quizId: string;
  quizTitle: string;
  scores: Map<string, number>;
  participants: Set<string>;
  top3Points: number;
  othersPoints: number;
}): QuizFinishRewardResult {
  const result: QuizFinishRewardResult = {
    top3Points: input.top3Points,
    othersPoints: input.othersPoints,
    top3: [],
    others: [],
  };
  if (!env.pointsEnabled) return result;

  const ranking = [...input.scores.entries()].sort((a, b) => b[1] - a[1]);
  const top3Ids = new Set(ranking.slice(0, 3).map(([userId]) => userId));

  for (const [userId, quizPts] of ranking.slice(0, 3)) {
    const saldo = creditCommunityPoints(userId, input.top3Points, 'quiz_top3', input.quizId);
    if (saldo != null) {
      result.top3.push({ userId, quizPts, saldo });
      log.info(
        `[quiz] +${input.top3Points} top 3 → ${userId} (quiz ${input.quizId}, ${quizPts} acertos) → saldo ${saldo}`,
      );
    }
  }

  for (const userId of input.participants) {
    if (top3Ids.has(userId)) continue;
    const saldo = creditCommunityPoints(userId, input.othersPoints, 'quiz_participacao', input.quizId);
    if (saldo != null) {
      result.others.push({ userId, saldo });
      log.info(
        `[quiz] +${input.othersPoints} participação → ${userId} (quiz ${input.quizId}) → saldo ${saldo}`,
      );
    }
  }

  return result;
}

export function formatQuizFinishRewardLog(
  quizTitle: string,
  quizId: string,
  rewards: QuizFinishRewardResult,
): string {
  const lines = [`Quiz **${quizTitle}** (\`${quizId}\`)`, ''];
  if (rewards.top3.length > 0) {
    lines.push(`**Top 3 (+${rewards.top3Points} pts cada):**`);
    for (const [i, row] of rewards.top3.entries()) {
      const medal = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
      lines.push(`${medal} <@${row.userId}> — ${row.quizPts} acerto(s) → saldo **${row.saldo}**`);
    }
  } else {
    lines.push('_Nenhum premiado no top 3._');
  }
  if (rewards.others.length > 0) {
    lines.push('', `**Participação (+${rewards.othersPoints} pts cada):**`);
    lines.push(
      rewards.others.map((r) => `• <@${r.userId}> → saldo **${r.saldo}**`).join('\n'),
    );
  }
  return lines.join('\n').slice(0, 4000);
}

export function rewardEventParticipants(userIds: string[], eventId: string): void {
  if (!env.pointsEnabled || userIds.length === 0) return;
  const pts = env.pointsEventParticipation;
  for (const userId of userIds) {
    creditCommunityPoints(userId, pts, 'evento', eventId);
  }
}

export function rewardPalpitePoints(
  userId: string,
  tipo: 'exato' | 'vencedor',
  rodadaId: number,
  partidaId: number,
): void {
  if (!env.pointsEnabled) return;
  const delta = tipo === 'exato' ? env.pointsPalpiteExato : env.pointsPalpiteVencedor;
  creditCommunityPoints(userId, delta, 'palpite', `rodada:${rodadaId}:partida:${partidaId}:${tipo}`);
}
