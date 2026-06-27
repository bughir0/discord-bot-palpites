const BOT_API_DIRECT =
  process.env.NEXT_PUBLIC_BOT_API_URL ?? "http://localhost:3001";

function botApiBase(): string {
  if (typeof window !== "undefined") return "/bot-api";
  return BOT_API_DIRECT;
}

function formatFetchError(path: string, err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
    return new Error(
      `Não foi possível conectar ao bot (API em ${BOT_API_DIRECT}). ` +
        `Na raiz do projeto, rode "npm run dev".`,
    );
  }
  return new Error(msg || `Erro ao chamar ${path}`);
}

function formatHttpError(method: string, path: string, status: number): Error {
  if (status === 401) {
    return new Error("Sessão expirada. Faça login novamente em /login.");
  }
  if (status === 503 || status >= 500) {
    return new Error(
      `Bot offline ou inacessível em ${BOT_API_DIRECT}. Na raiz, execute "npm run dev" e aguarde a porta 3001.`,
    );
  }
  return new Error(`${method} ${path} -> HTTP ${status}`);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const url = `${botApiBase()}${path}`;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";

  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    });
    if (!res.ok) throw formatHttpError(method, path, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Bot offline")) throw err;
    if (err instanceof Error && err.message.includes("-> HTTP")) throw err;
    throw formatFetchError(path, err);
  }
}

export type QuizConfig = {
  defaultChannelId?: string;
  defaultQuestionTime?: number;
  rankingEnabled?: boolean;
};

export type QuizQuestion = {
  id: string;
  enunciado: string;
  alternativas: string[];
  corretaIndex: number;
  tempo?: number;
  pontos?: number;
};

export type Quiz = {
  id: string;
  titulo: string;
  descricao?: string;
  tempoPadrao?: number;
  pontosPadrao?: number;
  perguntas: QuizQuestion[];
};

export type QuizStatus = {
  quiz: string;
  atual: {
    numero: number;
    total: number;
    enunciado: string;
    tempoRestante: string;
    terminaEm?: number | null;
  };
  proxima: { numero: number; enunciado: string; prevista: string; timestamp?: number | null };
  progresso: number;
  participantes?: number;
};

export const quizApi = {
  getConfig: () => request<{ config: QuizConfig }>("GET", "/config"),
  saveConfig: (body: QuizConfig) =>
    request<{ config: QuizConfig }>("POST", "/config", body),
  listQuizzes: () => request<{ quizzes: Quiz[] }>("GET", "/quizzes"),
  createQuiz: (body: {
    titulo: string;
    descricao?: string;
    tempoPadrao?: number;
    pontosPadrao?: number;
  }) => request<{ ok?: boolean; quiz?: Quiz }>("POST", "/quizzes", body),
  patchQuiz: (
    id: string,
    body: {
      titulo?: string;
      descricao?: string;
      tempoPadrao?: number;
      pontosPadrao?: number;
    },
  ) => request<{ ok?: boolean; quiz: Quiz }>("PATCH", `/quizzes/${id}`, body),
  deleteQuiz: (id: string) =>
    request<{ ok?: boolean }>("DELETE", `/quizzes/${id}`),
  addQuestion: (
    quizId: string,
    body: {
      enunciado: string;
      alternativas: string[];
      corretaIndex: number;
      tempo?: number;
      pontos?: number;
    },
  ) =>
    request<{ ok?: boolean; quiz: Quiz }>(
      "POST",
      `/quizzes/${quizId}/questions`,
      body,
    ),
  bulkQuestions: (
    quizId: string,
    body: { questions: unknown[] },
  ) =>
    request<{ ok?: boolean; quiz: Quiz; added?: number; skipped?: number }>(
      "POST",
      `/quizzes/${quizId}/questions/bulk`,
      body,
    ),
  updateQuestion: (
    quizId: string,
    questionId: string,
    body: {
      enunciado: string;
      alternativas: string[];
      corretaIndex: number;
      tempo?: number;
      pontos?: number;
    },
  ) =>
    request<{ ok?: boolean; quiz: Quiz }>(
      "PUT",
      `/quizzes/${quizId}/questions/${questionId}`,
      body,
    ),
  deleteQuestion: (quizId: string, questionId: string) =>
    request<{ ok?: boolean; quiz: Quiz }>(
      "DELETE",
      `/quizzes/${quizId}/questions/${questionId}`,
    ),
  getStatus: (signal?: AbortSignal) =>
    request<QuizStatus>("GET", "/status", undefined, { signal }),
};
