import type { ParsedQuestionDraft } from "./parseBulkQuestions"

/** Provedor gratuito recomendado: Groq (sem cartão, ~1000 req/dia no 70B). */
export const DEFAULT_AI_PROVIDER = "groq" as const

const GEMINI_MODEL = "gemini-2.5-flash"
const OPENROUTER_MODEL = "openrouter/free"
const OPENROUTER_FALLBACK_MODEL = "openrouter/free"
/** Modelos :free removidos ou indisponíveis no OpenRouter — migrados automaticamente. */
export const DEPRECATED_OPENROUTER_MODELS = new Set([
  "meta-llama/llama-3.1-8b-instruct:free",
])
/** Modelos Gemini descontinuados em jun/2026 — migrados automaticamente. */
export const DEPRECATED_GEMINI_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
])
/** Groq: tier gratuito, bom para JSON estruturado de quiz. */
const GROQ_MODEL = "llama-3.3-70b-versatile"
const OPENAI_MODEL = "gpt-4o-mini"

export const FREE_AI_PROVIDER_HINTS: Record<AiProvider, string> = {
  groq: "Recomendado — gratuito, rápido. Chave em console.groq.com/keys (gsk_…).",
  gemini: "Gratuito em aistudio.google.com/apikey. Modelo padrão: gemini-2.5-flash.",
  openrouter: "Modelos :free instáveis. Use openrouter/free ou créditos pagos.",
  openai: "Pago — requer créditos na conta OpenAI.",
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

/**
 * Gera perguntas com provedores de IA no navegador.
 * A chave fica só no navegador (localStorage) — não use em produção pública sem proxy.
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
  const lang =
    language === "en"
      ? "English"
      : language === "es"
        ? "español"
        : "português do Brasil"

  const prompt = `Você gera perguntas de quiz em ${lang}.
Tema: ${topic}
Quantidade: exatamente ${n} perguntas.
Dificuldade: ${difficulty}.
Cada pergunta: enunciado claro; 4 alternativas (strings); exatamente uma correta.
Responda APENAS JSON no formato:
{"questions":[{"enunciado":"...","alternativas":["...","...","...","..."],"corretaIndex":0}]}
corretaIndex é o índice 0..3 da alternativa correta. Sem markdown, sem texto fora do JSON.`

  let rawText = ""
  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.65,
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
    rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  } else {
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
      headers["HTTP-Referer"] = "https://quiz-co.local"
      headers["X-Title"] = "Quiz CO"
    }
    const sendRequest = async (selectedModel: string) =>
      fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          temperature: 0.65,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Você é um gerador de perguntas de quiz em JSON válido." },
            { role: "user", content: prompt },
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
        // Fallback para o roteador de modelos gratuitos quando o slug escolhido não está disponível.
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
    rawText = data.choices?.[0]?.message?.content ?? ""
  }
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
