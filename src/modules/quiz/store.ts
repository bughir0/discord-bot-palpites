import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config';

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
  quizId: string;
  quizTitle: string;
  channelId: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion?: {
    numero: number;
    total: number;
    enunciado: string;
    tempoRestante: number;
    tempoTotal: number;
    startsAt?: number;
    endsAt?: number;
  };
  nextQuestion?: {
    numero: number;
    enunciado: string;
    prevista: number;
    startsAt?: number;
  };
  progresso: number;
  participantes: number;
  startTime: number;
};

export type BotQuizConfig = {
  defaultChannelId?: string;
  defaultQuestionTime?: number;
  rankingEnabled?: boolean;
};

type Persisted = {
  version: 1;
  config: BotQuizConfig;
  quizzes: Quiz[];
};

const dataPath = path.join(path.dirname(env.databasePath), 'quiz-data.json');

function defaultState(): Persisted {
  return {
    version: 1,
    config: { defaultQuestionTime: 20, rankingEnabled: true },
    quizzes: [],
  };
}

function parsePersisted(raw: string): Persisted | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const quizzes = Array.isArray(parsed.quizzes) ? parsed.quizzes : [];
    if (quizzes.length === 0) return null;
    return {
      version: 1,
      config: { ...defaultState().config, ...parsed.config },
      quizzes: quizzes as Quiz[],
    };
  } catch {
    return null;
  }
}

function loadFile(): Persisted {
  try {
    if (fs.existsSync(dataPath)) {
      const state = parsePersisted(fs.readFileSync(dataPath, 'utf8'));
      if (state) return state;
      return defaultState();
    }

    return defaultState();
  } catch {
    return defaultState();
  }
}

function saveFile(state: Persisted): void {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${dataPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, dataPath);
}

let memory = loadFile();
let activeStatus: QuizStatus | null = null;

const newId = () => Math.random().toString(36).slice(2, 9);

export const quizStore = {
  getConfig(): BotQuizConfig {
    return memory.config;
  },
  setConfig(patch: Partial<BotQuizConfig>): BotQuizConfig {
    memory.config = { ...memory.config, ...patch };
    saveFile(memory);
    return memory.config;
  },
  getQuizzes(): Quiz[] {
    return memory.quizzes;
  },
  getQuiz(id: string): Quiz | undefined {
    return memory.quizzes.find((q) => q.id === id);
  },
  createQuiz(partial: Partial<Quiz>): Quiz {
    const quiz: Quiz = {
      id: partial.id ?? newId(),
      titulo: partial.titulo ?? 'Sem título',
      descricao: partial.descricao,
      tempoPadrao: partial.tempoPadrao ?? 20,
      pontosPadrao: partial.pontosPadrao ?? 1,
      perguntas: partial.perguntas ?? [],
    };
    memory.quizzes.push(quiz);
    saveFile(memory);
    return quiz;
  },
  upsertQuiz(quiz: Quiz): void {
    const idx = memory.quizzes.findIndex((q) => q.id === quiz.id);
    if (idx >= 0) memory.quizzes[idx] = quiz;
    else memory.quizzes.push(quiz);
    saveFile(memory);
  },
  patchQuiz(id: string, patch: Partial<Pick<Quiz, 'titulo' | 'descricao' | 'tempoPadrao' | 'pontosPadrao'>>): Quiz | null {
    const quiz = memory.quizzes.find((q) => q.id === id);
    if (!quiz) return null;
    if (patch.titulo !== undefined) quiz.titulo = patch.titulo;
    if (patch.descricao !== undefined) quiz.descricao = patch.descricao;
    if (patch.tempoPadrao !== undefined) quiz.tempoPadrao = patch.tempoPadrao;
    if (patch.pontosPadrao !== undefined) quiz.pontosPadrao = patch.pontosPadrao;
    saveFile(memory);
    return quiz;
  },
  deleteQuiz(id: string): boolean {
    const before = memory.quizzes.length;
    memory.quizzes = memory.quizzes.filter((q) => q.id !== id);
    if (memory.quizzes.length !== before) {
      saveFile(memory);
      return true;
    }
    return false;
  },
  addQuestion(quizId: string, q: Partial<QuizQuestion>): Quiz | null {
    const quiz = memory.quizzes.find((x) => x.id === quizId);
    if (!quiz) return null;
    quiz.perguntas.push({
      id: q.id ?? newId(),
      enunciado: q.enunciado ?? 'Pergunta',
      alternativas: q.alternativas ?? [],
      corretaIndex: q.corretaIndex ?? 0,
      tempo: q.tempo ?? quiz.tempoPadrao,
      pontos: q.pontos ?? quiz.pontosPadrao,
    });
    saveFile(memory);
    return quiz;
  },
  addQuestionsBulk(quizId: string, questions: Partial<QuizQuestion>[]): { quiz: Quiz | null; added: number; skipped: number } {
    const quiz = memory.quizzes.find((x) => x.id === quizId);
    if (!quiz) return { quiz: null, added: 0, skipped: 0 };
    let added = 0;
    let skipped = 0;
    for (const q of questions) {
      const alts = (q.alternativas ?? []).map((s) => String(s).trim()).filter(Boolean);
      if (alts.length < 2) { skipped++; continue; }
      let ci = Number(q.corretaIndex ?? 0);
      if (!Number.isInteger(ci) || ci < 0 || ci >= alts.length) ci = 0;
      quiz.perguntas.push({
        id: newId(),
        enunciado: String(q.enunciado ?? '').trim() || 'Sem enunciado',
        alternativas: alts,
        corretaIndex: ci,
        tempo: q.tempo ?? quiz.tempoPadrao,
        pontos: q.pontos ?? quiz.pontosPadrao,
      });
      added++;
    }
    saveFile(memory);
    return { quiz, added, skipped };
  },
  updateQuestion(quizId: string, questionId: string, patch: Partial<QuizQuestion>): Quiz | null {
    const quiz = memory.quizzes.find((x) => x.id === quizId);
    if (!quiz) return null;
    const idx = quiz.perguntas.findIndex((q) => q.id === questionId);
    if (idx < 0) return null;
    const cur = quiz.perguntas[idx];
    const alts = patch.alternativas ?? cur.alternativas;
    quiz.perguntas[idx] = {
      ...cur,
      ...patch,
      alternativas: alts,
      corretaIndex: patch.corretaIndex ?? cur.corretaIndex,
    };
    saveFile(memory);
    return quiz;
  },
  deleteQuestion(quizId: string, questionId: string): Quiz | null {
    const quiz = memory.quizzes.find((x) => x.id === quizId);
    if (!quiz) return null;
    quiz.perguntas = quiz.perguntas.filter((q) => q.id !== questionId);
    saveFile(memory);
    return quiz;
  },
  getStatus(): QuizStatus | null {
    return activeStatus;
  },
  setStatus(status: QuizStatus | null): void {
    activeStatus = status;
  },
};

export function importQuizFromFile(sourcePath: string): { quizzes: number; questions: number } {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Arquivo não encontrado: ${resolved}`);
  }
  const imported = parsePersisted(fs.readFileSync(resolved, 'utf8'));
  if (!imported) {
    throw new Error(`Nenhum quiz válido em ${resolved}`);
  }
  memory = imported;
  saveFile(memory);
  const questions = memory.quizzes.reduce((sum, q) => sum + q.perguntas.length, 0);
  return { quizzes: memory.quizzes.length, questions };
}
