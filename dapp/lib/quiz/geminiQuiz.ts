import type { ParsedQuestionDraft } from "./parseBulkQuestions"

/** Gemini costuma errar menos em fatos do que Llama no tier gratuito. */
export const DEFAULT_AI_PROVIDER = "gemini" as const

const GEMINI_MODEL = "gemini-2.5-flash"
const GEMINI_QUALITY_MODEL = "gemini-2.5-pro"
const OPENROUTER_MODEL = "google/gemini-2.0-flash-exp:free"
const OPENROUTER_FALLBACK_MODEL = "openrouter/free"
export const DEPRECATED_OPENROUTER_MODELS = new Set([
  "meta-llama/llama-3.1-8b-instruct:free",
  "openrouter/free",
])
export const DEPRECATED_GEMINI_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
])
const GROQ_MODEL = "llama-3.3-70b-versatile"
const GROQ_ALT_MODEL = "qwen/qwen3-32b"
const OPENAI_MODEL = "gpt-4o-mini"

/** Temperatura baixa = menos “inventação” de fatos. */
const AI_TEMPERATURE = 0.25

export const SUGGESTED_MODELS: Record<AiProvider, { id: string; label: string }[]> = {
  gemini: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (grátis, recomendado)" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (grátis, mais preciso — cota menor)" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (equilibrado)" },
    { id: "qwen/qwen3-32b", label: "Qwen3 32B (bom em PT)" },
    { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B (rápido)" },
  ],
  openrouter: [
    { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)" },
    { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free, se disponível)" },
  ],
  openai: [{ id: "gpt-4o-mini", label: "GPT-4o mini (pago)" }],
}

export const FREE_AI_PROVIDER_HINTS: Record<AiProvider, string> = {
  gemini:
    "Recomendado para quizzes factuais — chave grátis em aistudio.google.com/apikey. Revise sempre o rascunho antes de publicar.",
  groq: "Grátis em console.groq.com/keys. Llama 70B é rápido, mas pode inventar fatos em temas de nicho (ex.: cinema BR). Prefira Gemini para precisão.",
  openrouter: "Modelos :free mudam com frequência. Se falhar, troque o slug do modelo ou use Gemini.",
  openai: "Pago — melhor qualidade, mas requer créditos na OpenAI.",
}

type GeminiPart = { text?: string }
type OpenAIStyleResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

export type AiProvider = "gemini" | "openrouter" | "groq" | "openai"
export type AiLanguage = "pt-BR" | "en" | "es"

export function defaultModelForProvider(provider: AiProvider): string {
  if (provider === "gemini") return GEMINI_MODEL
  if (provider === "openrouter") return OPENROUTER_MODEL
  if (provider === "groq") return GROQ_MODEL
  return OPENAI_MODEL
}

function isOpenRouterUnavailableModel(status: number, text: string): boolean {
  if (status !== 404 && status !== 400) return false
  const t = text.toLowerCase()
  return (
    t.includes("no endpoints found") ||
    t.includes("model not found") ||
    t.includes("unavailable for free") ||
    t.includes("is unavailable")
  )
}

function parseAiJson(text: string): { questions: unknown[] } {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fence ? fence[1].trim() : trimmed
  const data = JSON.parse(raw) as { questions?: unknown[] }
  if (!data || !Array.isArray(data.questions)) {
    throw new Error("JSON da IA sem array 'questions'")
  }
  return data as { questions: unknown[] }
}

function normalizeOne(raw: unknown): ParsedQuestionDraft | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const enunciado = String(o.enunciado ?? "").trim()
  const alternativas = Array.isArray(o.alternativas)
    ? o.alternativas.map((x) => String(x ?? "").trim()).filter(Boolean)
    : []
  let corretaIndex = Number(o.corretaIndex ?? 0)
  if (!Number.isInteger(corretaIndex)) corretaIndex = 0
  if (enunciado.length < 2 || alternativas.length < 2) return null
  if (corretaIndex < 0 || corretaIndex >= alternativas.length) corretaIndex = 0
  return { enunciado, alternativas, corretaIndex }
}

function difficultyRules(difficulty: string, language: AiLanguage): string {
  const pt = language === "pt-BR"
  if (difficulty === "fácil" || difficulty === "facil") {
    return pt
      ? "Nível FÁCIL: só fatos muito conhecidos (blockbusters, recordes famosos, personagens icônicos). Evite curiosidades obscuras."
      : "EASY: only widely known facts. No obscure trivia."
  }
  if (difficulty === "difícil" || difficulty === "dificil") {
    return pt
      ? "Nível DIFÍCIL: pode exigir mais conhecimento, mas AINDA assim só fatos verificáveis em fontes confiáveis — nunca invente datas, diretores ou títulos."
      : "HARD: deeper knowledge OK, but every fact must still be verifiable."
  }
  return pt
    ? "Nível MÉDIO: mix de fatos populares e alguns detalhes, sempre corretos."
    : "MEDIUM: mix of popular and moderate facts, all correct."
}

function buildQuizPrompt(opts: {
  topic: string
  count: number
  difficulty: string
  language: AiLanguage
  batchPart?: number
  batchTotal?: number
}): { system: string; user: string } {
  const { topic, count, difficulty, language, batchPart, batchTotal } = opts
  const lang =
    language === "en" ? "English" : language === "es" ? "español" : "português do Brasil"

  const batchNote =
    batchPart && batchTotal && batchTotal > 1
      ? `\nEste é o lote ${batchPart}/${batchTotal}. Gere perguntas NOVAS, sem repetir enunciados ou fatos de lotes anteriores.`
      : ""

  const system =
    language === "pt-BR"
      ? `Você é um editor de quizzes factuais para comunidades brasileiras.
Regras absolutas:
- Use SOMENTE fatos corretos e verificáveis sobre o tema.
- NUNCA invente títulos de obras, nomes de pessoas, datas, placares ou eventos.
- Se o tema for cinema/séries BR: prefira obras e nomes famosos (ex.: Cidade de Deus, Tropa de Elite, Central do Brasil). Se não tiver certeza sobre um filme obscuro, NÃO use.
- Cada pergunta: enunciado claro, 4 alternativas, exatamente 1 correta; distratores plausíveis mas errados.
- Evite perguntas ambíguas ou com mais de uma resposta aceitável.
- Varie corretaIndex entre 0, 1, 2 e 3 — não coloque sempre a correta na letra A.
- Responda APENAS JSON válido, sem markdown.`
      : `You write factual quiz questions. Only verifiable facts. Never invent names, dates, or titles. One correct answer per question. JSON only.`

  const user = `Idioma: ${lang}
Tema: ${topic}
Quantidade neste lote: exatamente ${count} pergunta(s).
${difficultyRules(difficulty, language)}${batchNote}

Formato (JSON puro):
{"questions":[{"enunciado":"...","alternativas":["...","...","...","..."],"corretaIndex":0}]}

corretaIndex = índice 0..3 da alternativa correta.`

  return { system, user }
}

async function callAiProvider(opts: {
  provider: AiProvider
  apiKey: string
  model: string
  system: string
  user: string
}): Promise<string> {
  const { provider, apiKey, model, system, user } = opts

  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: {
          temperature: AI_TEMPERATURE,
          responseMimeType: "application/json",
        },
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Gemini ${res.status}: ${t.slice(0, 280)}`)
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  }

  const url =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : provider === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions"
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://palpito-discord.vercel.app"
    headers["X-Title"] = "Palpito Quiz"
  }

  const sendRequest = async (selectedModel: string) =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: selectedModel,
        temperature: AI_TEMPERATURE,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    })

  let res = await sendRequest(model)
  if (!res.ok) {
    const t = await res.text()
    if (
      provider === "openrouter" &&
      isOpenRouterUnavailableModel(res.status, t) &&
      model !== OPENROUTER_FALLBACK_MODEL
    ) {
      res = await sendRequest(OPENROUTER_FALLBACK_MODEL)
      if (!res.ok) {
        const retryText = await res.text()
        throw new Error(`OpenRouter ${res.status}: ${retryText.slice(0, 280)}`)
      }
    } else {
      const name = provider === "openrouter" ? "OpenRouter" : provider === "groq" ? "Groq" : "OpenAI"
      throw new Error(`${name} ${res.status}: ${t.slice(0, 280)}`)
    }
  }
  const data = (await res.json()) as OpenAIStyleResponse
  return data.choices?.[0]?.message?.content ?? ""
}

async function generateBatch(
  opts: {
    provider: AiProvider
    apiKey: string
    model: string
    topic: string
    count: number
    difficulty: string
    language: AiLanguage
    batchPart?: number
    batchTotal?: number
  },
): Promise<ParsedQuestionDraft[]> {
  const { system, user } = buildQuizPrompt(opts)
  const rawText = await callAiProvider({
    provider: opts.provider,
    apiKey: opts.apiKey,
    model: opts.model,
    system,
    user,
  })
  if (!rawText) throw new Error("Resposta vazia da IA")

  const parsed = parseAiJson(rawText)
  const out: ParsedQuestionDraft[] = []
  for (const q of parsed.questions) {
    const norm = normalizeOne(q)
    if (norm) out.push(norm)
  }
  if (out.length === 0) throw new Error("A IA não retornou perguntas válidas")
  return out
}

const BATCH_SIZE = 8

/**
 * Gera perguntas com provedores de IA no navegador.
 * A chave fica só no localStorage — revise sempre o rascunho antes de publicar.
 */
export async function generateQuestionsWithAI(opts: {
  provider: AiProvider
  apiKey: string
  model?: string
  topic: string
  count: number
  difficulty?: string
  language?: AiLanguage
}): Promise<ParsedQuestionDraft[]> {
  const {
    provider,
    apiKey,
    model = defaultModelForProvider(opts.provider),
    topic,
    count,
    difficulty = "médio",
    language = "pt-BR",
  } = opts
  const n = Math.max(1, Math.floor(count))
  const base = { provider, apiKey, model, topic, difficulty, language }

  if (n <= BATCH_SIZE) {
    return generateBatch({ ...base, count: n })
  }

  const totalParts = Math.ceil(n / BATCH_SIZE)
  const all: ParsedQuestionDraft[] = []
  for (let part = 1; part <= totalParts; part++) {
    const remaining = n - all.length
    const batchCount = Math.min(BATCH_SIZE, remaining)
    const batch = await generateBatch({
      ...base,
      count: batchCount,
      batchPart: part,
      batchTotal: totalParts,
    })
    all.push(...batch)
  }
  return all.slice(0, n)
}

export { GEMINI_QUALITY_MODEL, GROQ_ALT_MODEL }
