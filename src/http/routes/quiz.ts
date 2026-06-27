import type { FastifyInstance } from 'fastify';
import { quizStore, type Quiz, type QuizQuestion, type QuizStatus } from '../../modules/quiz/store';

function formatStatusResponse() {
  const status = quizStore.getStatus();
  if (!status) {
    return {
      ok: true,
      quiz: 'Nenhum quiz ativo',
      atual: { numero: 0, total: 0, enunciado: 'Aguardando quiz...', tempoRestante: '0s', terminaEm: null as number | null },
      proxima: { numero: 0, enunciado: 'Aguardando', prevista: '--', timestamp: null as number | null },
      progresso: 0,
      participantes: 0,
    };
  }
  const now = Date.now();
  let tempoRestante = 0;
  let terminaEm: number | null = null;
  if (status.currentQuestion) {
    const elapsed = Math.floor((now - status.startTime) / 1000);
    tempoRestante = Math.max(0, status.currentQuestion.tempoTotal - elapsed);
    terminaEm = status.currentQuestion.endsAt ?? status.startTime + status.currentQuestion.tempoTotal * 1000;
  }
  return {
    ok: true,
    quiz: status.quizTitle,
    atual: status.currentQuestion
      ? {
          numero: status.currentQuestion.numero,
          total: status.currentQuestion.total,
          enunciado: status.currentQuestion.enunciado,
          tempoRestante: `${tempoRestante}s`,
          terminaEm,
        }
      : { numero: 0, total: status.totalQuestions, enunciado: 'Aguardando...', tempoRestante: '0s', terminaEm: null },
    proxima: status.nextQuestion
      ? {
          numero: status.nextQuestion.numero,
          enunciado: status.nextQuestion.enunciado,
          prevista: `em ${status.nextQuestion.prevista}s`,
          timestamp: status.nextQuestion.startsAt ?? terminaEm,
        }
      : { numero: 0, enunciado: 'Fim do quiz', prevista: '--', timestamp: null },
    progresso: status.progresso,
    participantes: status.participantes,
  };
}

export function registerQuizRoutes(fastify: FastifyInstance): void {
  fastify.get('/quiz/health', async () => ({ ok: true, service: 'quiz-api' }));
  fastify.get('/api', async () => ({ ok: true, service: 'quiz-api' }));

  fastify.get('/config', async () => ({ ok: true, config: quizStore.getConfig() }));
  fastify.post('/config', async (req) => {
    const body = req.body as Record<string, unknown>;
    const config = quizStore.setConfig(body as never);
    return { ok: true, config };
  });

  fastify.get('/quizzes', async () => ({ ok: true, quizzes: quizStore.getQuizzes() }));
  fastify.get<{ Params: { id: string } }>('/quizzes/:id', async (req) => {
    const quiz = quizStore.getQuiz(req.params.id);
    if (!quiz) return { ok: false, error: 'Quiz não encontrado' };
    return { ok: true, quiz };
  });
  fastify.post('/quizzes', async (req) => {
    const body = req.body as Partial<Quiz>;
    const quiz = quizStore.createQuiz(body);
    return { ok: true, quiz };
  });
  fastify.patch<{ Params: { id: string } }>('/quizzes/:id', async (req) => {
    const quiz = quizStore.patchQuiz(req.params.id, req.body as never);
    if (!quiz) return { ok: false, error: 'Quiz não encontrado' };
    return { ok: true, quiz };
  });
  fastify.delete<{ Params: { id: string } }>('/quizzes/:id', async (req) => {
    const ok = quizStore.deleteQuiz(req.params.id);
    return ok ? { ok: true } : { ok: false, error: 'Quiz não encontrado' };
  });

  fastify.post<{ Params: { id: string } }>('/quizzes/:id/questions', async (req) => {
    const quiz = quizStore.addQuestion(req.params.id, req.body as Partial<QuizQuestion>);
    if (!quiz) return { ok: false, error: 'Quiz não encontrado' };
    return { ok: true, quiz };
  });
  fastify.post<{ Params: { id: string } }>('/quizzes/:id/questions/bulk', async (req) => {
    const body = req.body as { questions?: Partial<QuizQuestion>[] };
    const result = quizStore.addQuestionsBulk(req.params.id, body.questions ?? []);
    if (!result.quiz) return { ok: false, error: 'Quiz não encontrado' };
    return { ok: true, quiz: result.quiz, added: result.added, skipped: result.skipped };
  });
  fastify.put<{ Params: { id: string; questionId: string } }>('/quizzes/:id/questions/:questionId', async (req) => {
    const quiz = quizStore.updateQuestion(req.params.id, req.params.questionId, req.body as Partial<QuizQuestion>);
    if (!quiz) return { ok: false, error: 'Não encontrado' };
    return { ok: true, quiz };
  });
  fastify.delete<{ Params: { id: string; questionId: string } }>('/quizzes/:id/questions/:questionId', async (req) => {
    const quiz = quizStore.deleteQuestion(req.params.id, req.params.questionId);
    if (!quiz) return { ok: false, error: 'Não encontrado' };
    return { ok: true, quiz };
  });

  fastify.get('/status', async () => formatStatusResponse());
  fastify.post('/status', async (req) => {
    quizStore.setStatus(req.body as QuizStatus);
    return { ok: true, status: quizStore.getStatus() };
  });
  fastify.delete('/status', async () => {
    quizStore.setStatus(null);
    return { ok: true };
  });
}
