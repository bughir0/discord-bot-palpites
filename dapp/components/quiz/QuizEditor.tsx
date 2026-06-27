import { useCallback, useEffect, useState } from "react";
import {
  defaultModelForProvider,
  DEFAULT_AI_PROVIDER,
  DEPRECATED_GEMINI_MODELS,
  DEPRECATED_OPENROUTER_MODELS,
  FREE_AI_PROVIDER_HINTS,
  generateQuestionsWithAI,
  type AiLanguage,
  type AiProvider,
} from "@/lib/quiz/geminiQuiz";
import { parseBulkQuestions, type ParsedQuestionDraft } from "@/lib/quiz/parseBulkQuestions";
import { quizApi } from "@/lib/quiz-api";
import { SmartTimePicker } from "./SmartTimePicker";

export type Quiz = {
  id: string
  titulo: string
  descricao?: string
  tempoPadrao?: number
  pontosPadrao?: number
  perguntas: Array<{
    id: string
    enunciado: string
    alternativas: string[]
    corretaIndex: number
    tempo?: number
    pontos?: number
  }>
}

const LS_AI_PROVIDER = "quiz_co_ai_provider"
const LS_AI_LANGUAGE = "quiz_co_ai_language"
const LS_AI_MODEL = "quiz_co_ai_model"
const LS_AI_KEY_PREFIX = "quiz_co_ai_api_key_"

type Tab = "uma" | "lote" | "ia"

export function QuizEditor({
  quiz,
  loading,
  onLoading,
  onNotify,
  onQuizUpdated,
}: {
  quiz: Quiz;
  loading: boolean;
  onLoading: (v: boolean) => void;
  onNotify: (m: { type: "success" | "error"; text: string }) => void;
  onQuizUpdated: (q: Quiz) => void;
}) {
  const [tab, setTab] = useState<Tab>("uma")
  const [newQuestion, setNewQuestion] = useState({
    enunciado: "",
    alternativas: ["", "", "", ""],
    corretaIndex: 0,
    tempo: quiz.tempoPadrao ?? 20,
    pontos: quiz.pontosPadrao ?? 1,
  })

  const [bulkText, setBulkText] = useState("")
  const [bulkTempo, setBulkTempo] = useState(quiz.tempoPadrao ?? 20)
  const [bulkPontos, setBulkPontos] = useState(quiz.pontosPadrao ?? 1)

  const [aiProvider, setAiProvider] = useState<AiProvider>(DEFAULT_AI_PROVIDER)
  const [aiLanguage, setAiLanguage] = useState<AiLanguage>("pt-BR")
  const [aiKey, setAiKey] = useState("")
  const [aiModel, setAiModel] = useState(defaultModelForProvider(DEFAULT_AI_PROVIDER))
  const [aiTopic, setAiTopic] = useState("")
  const [aiCount, setAiCount] = useState(5)
  const [aiDifficulty, setAiDifficulty] = useState("médio")
  const [aiPreview, setAiPreview] = useState<ParsedQuestionDraft[] | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    let provider = (window.localStorage.getItem(LS_AI_PROVIDER) as AiProvider | null) ?? DEFAULT_AI_PROVIDER
    const language = (window.localStorage.getItem(LS_AI_LANGUAGE) as AiLanguage | null) ?? "pt-BR"
    let model = window.localStorage.getItem(LS_AI_MODEL) ?? defaultModelForProvider(provider)
    if (provider === "openrouter" && DEPRECATED_OPENROUTER_MODELS.has(model)) {
      provider = DEFAULT_AI_PROVIDER
      model = defaultModelForProvider(provider)
      window.localStorage.setItem(LS_AI_PROVIDER, provider)
      window.localStorage.setItem(LS_AI_MODEL, model)
    } else if (provider === "gemini" && DEPRECATED_GEMINI_MODELS.has(model)) {
      model = defaultModelForProvider("gemini")
      window.localStorage.setItem(LS_AI_MODEL, model)
    }
    const key = window.localStorage.getItem(`${LS_AI_KEY_PREFIX}${provider}`) ?? ""
    setAiProvider(provider)
    setAiLanguage(language)
    setAiModel(model)
    setAiKey(key)
  }, [])

  useEffect(() => {
    setNewQuestion((q) => ({
      ...q,
      tempo: quiz.tempoPadrao ?? 20,
      pontos: quiz.pontosPadrao ?? 1,
    }))
    setBulkTempo(quiz.tempoPadrao ?? 20)
    setBulkPontos(quiz.pontosPadrao ?? 1)
  }, [quiz.tempoPadrao, quiz.pontosPadrao])

  const persistAiKey = (k: string) => {
    setAiKey(k)
    if (typeof window !== "undefined") {
      const keyName = `${LS_AI_KEY_PREFIX}${aiProvider}`
      if (k.trim()) window.localStorage.setItem(keyName, k.trim())
      else window.localStorage.removeItem(keyName)
    }
  }

  const handleProviderChange = (provider: AiProvider) => {
    setAiProvider(provider)
    setAiPreview(null)
    const nextModel = defaultModelForProvider(provider)
    setAiModel(nextModel)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_AI_PROVIDER, provider)
      window.localStorage.setItem(LS_AI_MODEL, nextModel)
      setAiKey(window.localStorage.getItem(`${LS_AI_KEY_PREFIX}${provider}`) ?? "")
    }
  }

  const submitBulk = useCallback(
    async (drafts: ParsedQuestionDraft[], label: string) => {
      if (drafts.length === 0) {
        onNotify({ type: "error", text: "Nenhuma pergunta válida para enviar." })
        return
      }
      try {
        onLoading(true);
        const data = await quizApi.bulkQuestions(quiz.id, {
          questions: drafts.map((d) => ({
            ...d,
            tempo: bulkTempo,
            pontos: bulkPontos,
          })),
        });
        if (!data.ok) {
          throw new Error("Falha ao importar perguntas.");
        }
        onQuizUpdated(data.quiz);
        const extra =
          typeof data.skipped === "number" && data.skipped > 0
            ? ` (${data.skipped} ignorada(s) por formato inválido)`
            : "";
        onNotify({
          type: "success",
          text: `${label}: ${data.added ?? drafts.length} pergunta(s) adicionada(s).${extra}`,
        });
        setBulkText("")
        setAiPreview(null)
      } catch (e) {
        onNotify({
          type: "error",
          text: e instanceof Error ? e.message : "Falha ao importar perguntas.",
        })
      } finally {
        onLoading(false)
      }
    },
    [quiz.id, bulkTempo, bulkPontos, onLoading, onNotify, onQuizUpdated],
  )

  const addOne = async () => {
    if (!newQuestion.enunciado.trim()) {
      onNotify({ type: "error", text: "Preencha o enunciado." })
      return
    }
    const alternativas = newQuestion.alternativas.map((a) => a.trim()).filter(Boolean)
    if (alternativas.length < 2) {
      onNotify({ type: "error", text: "Preencha pelo menos 2 alternativas." })
      return
    }
    try {
      onLoading(true);
      const data = await quizApi.addQuestion(quiz.id, {
        enunciado: newQuestion.enunciado,
        alternativas,
        corretaIndex: newQuestion.corretaIndex,
        tempo: newQuestion.tempo,
        pontos: newQuestion.pontos,
      });
      if (!data.ok) throw new Error("Erro ao adicionar");
      onQuizUpdated(data.quiz);
      setNewQuestion({
        enunciado: "",
        alternativas: ["", "", "", ""],
        corretaIndex: 0,
        tempo: quiz.tempoPadrao ?? 20,
        pontos: quiz.pontosPadrao ?? 1,
      })
      onNotify({ type: "success", text: "Pergunta adicionada." })
    } catch {
      onNotify({ type: "error", text: "Não foi possível adicionar a pergunta." })
    } finally {
      onLoading(false)
    }
  }

  const parseAndImportBulk = () => {
    const { ok, errors } = parseBulkQuestions(bulkText)
    if (errors.length) {
      onNotify({
        type: "error",
        text: errors.slice(0, 3).join(" ") + (errors.length > 3 ? " …" : ""),
      })
    }
    if (ok.length) void submitBulk(ok, "Importação em lote")
  }

  const runAi = async () => {
    const key = aiKey.trim()
    if (!key) {
      onNotify({ type: "error", text: "Informe a chave da IA selecionada." })
      return
    }
    if (!aiTopic.trim()) {
      onNotify({ type: "error", text: "Descreva o tema do quiz." })
      return
    }
    try {
      onLoading(true)
      const drafts = await generateQuestionsWithAI({
        provider: aiProvider,
        apiKey: key,
        model: aiModel.trim(),
        topic: aiTopic.trim(),
        count: aiCount,
        difficulty: aiDifficulty,
        language: aiLanguage,
      })
      setAiPreview(drafts)
      onNotify({ type: "success", text: `IA gerou ${drafts.length} pergunta(s). Revise e clique em adicionar.` })
    } catch (e) {
      onNotify({
        type: "error",
        text: e instanceof Error ? e.message : "Erro ao chamar a IA.",
      })
      setAiPreview(null)
    } finally {
      onLoading(false)
    }
  }

  return (
    <div className="quiz-editor">
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === "uma" ? "tab active" : "tab"}
          onClick={() => setTab("uma")}
        >
          ✦ Uma
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "lote" ? "tab active" : "tab"}
          onClick={() => setTab("lote")}
        >
          ≡ Lote
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "ia" ? "tab active" : "tab"}
          onClick={() => setTab("ia")}
        >
          ✧ IA
        </button>
      </div>

      {tab === "uma" && (
        <div className="tab-panel" key="uma">
          <label className="field">
            <span>Enunciado</span>
            <textarea
              value={newQuestion.enunciado}
              onChange={(e) => setNewQuestion((q) => ({ ...q, enunciado: e.target.value }))}
              placeholder="Ex.: Qual é a capital do Brasil?"
              rows={3}
            />
          </label>
          <label className="field">
            <span>Alternativas (marque a correta)</span>
            {newQuestion.alternativas.map((alt, idx) => (
              <div className="alt-row" key={idx}>
                <input
                  type="radio"
                  name={`correta-${quiz.id}`}
                  checked={newQuestion.corretaIndex === idx}
                  onChange={() => setNewQuestion((q) => ({ ...q, corretaIndex: idx }))}
                />
                <input
                  type="text"
                  value={alt}
                  onChange={(e) => {
                    const novas = [...newQuestion.alternativas]
                    novas[idx] = e.target.value
                    setNewQuestion((q) => ({ ...q, alternativas: novas }))
                  }}
                  placeholder={`Alternativa ${String.fromCharCode(65 + idx)}`}
                />
              </div>
            ))}
          </label>
          <div className="create-form-row">
            <SmartTimePicker
              variant="inline"
              label="Tempo"
              value={newQuestion.tempo}
              onChange={(tempo) => setNewQuestion((q) => ({ ...q, tempo }))}
              presets={[15, 20, 30, 35, 45, 60]}
            />
            <label className="field">
              <span>Pontos</span>
              <input
                type="number"
                value={newQuestion.pontos}
                onChange={(e) => setNewQuestion((q) => ({ ...q, pontos: Number(e.target.value) }))}
              />
            </label>
          </div>
          <button type="button" className="btn primary sm" onClick={() => void addOne()} disabled={loading}>
            {loading ? "Salvando…" : "Adicionar pergunta"}
          </button>
        </div>
      )}

      {tab === "lote" && (
        <div className="tab-panel" key="lote">
          <p className="help-block">
            Separe cada pergunta com uma <strong>linha em branco</strong>. Use linhas <code>A)</code>, <code>B)</code>…
            para alternativas e <code>* B</code> ou <code>Correta: B</code> para a resposta certa.
          </p>
          <textarea
            className="bulk-textarea"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`Exemplo:\n\nQual planeta é conhecido como Planeta Vermelho?\nA) Vênus\nB) Marte\nC) Júpiter\n* B\n\n2 + 2 = ?\nA) 3\nB) 4\nC) 5\nCorreta: B`}
            rows={14}
          />
          <div className="create-form-row">
            <SmartTimePicker
              variant="inline"
              label="Tempo do lote"
              value={bulkTempo}
              onChange={setBulkTempo}
              presets={[15, 20, 30, 35, 45, 60]}
            />
            <label className="field">
              <span>Pontos</span>
              <input type="number" value={bulkPontos} onChange={(e) => setBulkPontos(Number(e.target.value))} />
            </label>
          </div>
          <button
            type="button"
            className="btn primary sm"
            onClick={parseAndImportBulk}
            disabled={loading || !bulkText.trim()}
          >
            {loading ? "Importando…" : "Importar todas"}
          </button>
        </div>
      )}

      {tab === "ia" && (
        <div className="tab-panel" key="ia">
          <p className="help-block warn">
            A chave fica salva no seu navegador (localStorage). Você pode trocar de provedor e idioma da IA.
          </p>
          <div className="form-grid two tight">
            <label className="field">
              <span>Provedor de IA</span>
              <select value={aiProvider} onChange={(e) => handleProviderChange(e.target.value as AiProvider)}>
                <option value="groq">Groq (gratuito — recomendado)</option>
                <option value="gemini">Google Gemini (gratuito)</option>
                <option value="openrouter">OpenRouter (gratuito instável)</option>
                <option value="openai">OpenAI API (pago)</option>
              </select>
            </label>
            <label className="field">
              <span>Idioma da geração</span>
              <select
                value={aiLanguage}
                onChange={(e) => {
                  const language = e.target.value as AiLanguage
                  setAiLanguage(language)
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(LS_AI_LANGUAGE, language)
                  }
                }}
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>
              Chave API{" "}
              {aiProvider === "gemini"
                ? "Gemini"
                : aiProvider === "openrouter"
                  ? "OpenRouter"
                  : aiProvider === "groq"
                    ? "Groq"
                    : "OpenAI"}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={aiKey}
              onChange={(e) => persistAiKey(e.target.value)}
              placeholder={
                aiProvider === "gemini" ? "AIza…" : aiProvider === "groq" ? "gsk_…" : "sk-..."
              }
            />
          </label>
          <p className="help-block">{FREE_AI_PROVIDER_HINTS[aiProvider]}</p>
          <label className="field">
            <span>Modelo</span>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => {
                setAiModel(e.target.value)
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(LS_AI_MODEL, e.target.value)
                }
              }}
              placeholder="Nome do modelo"
            />
          </label>
          <p className="help-block">
            Links rápidos:{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
              Groq
            </a>{" "}
            •{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Gemini
            </a>{" "}
            •{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              OpenRouter
            </a>{" "}
            •{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              OpenAI
            </a>
          </p>
          <label className="field">
            <span>Tema do quiz</span>
            <input
              type="text"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="Ex.: História do Brasil, tecnologia, League of Legends…"
            />
          </label>
          <div className="form-grid two tight">
            <label className="field">
              <span>Quantidade</span>
              <input
                type="number"
                min={1}
                value={aiCount}
                onChange={(e) => setAiCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label className="field">
              <span>Dificuldade</span>
              <select value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value)}>
                <option value="fácil">Fácil</option>
                <option value="médio">Médio</option>
                <option value="difícil">Difícil</option>
              </select>
            </label>
          </div>
          <div className="create-form-row">
            <SmartTimePicker
              variant="inline"
              label="Tempo"
              value={bulkTempo}
              onChange={setBulkTempo}
              presets={[15, 20, 30, 35, 45, 60]}
            />
            <label className="field">
              <span>Pontos</span>
              <input type="number" value={bulkPontos} onChange={(e) => setBulkPontos(Number(e.target.value))} />
            </label>
          </div>
          <div className="cta-row">
            <button type="button" className="btn primary sm" onClick={() => void runAi()} disabled={loading}>
              {loading ? "Gerando…" : "Gerar rascunho"}
            </button>
            {aiPreview && aiPreview.length > 0 ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => void submitBulk(aiPreview, "IA")}
                disabled={loading}
              >
                Adicionar {aiPreview.length} ao quiz
              </button>
            ) : null}
          </div>
          {aiPreview && aiPreview.length > 0 ? (
            <ul className="ai-preview">
              {aiPreview.map((q, i) => (
                <li key={i}>
                  <strong>{i + 1}.</strong> {q.enunciado}
                  <span className="muted small">
                    {" "}
                    ({q.alternativas.length} alt. • correta índice {q.corretaIndex})
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  )
}
