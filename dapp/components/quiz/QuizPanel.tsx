"use client";

import { useEffect, useRef, useState } from "react";
import { StatusPanel } from "./StatusPanel";
import { QuizEditor, type Quiz } from "./QuizEditor";
import { SmartTimePicker } from "./SmartTimePicker";
import { formatQuizTime } from "@/lib/quiz/formatQuizTime";
import { quizApi } from "@/lib/quiz-api";

type QuestionRow = Quiz["perguntas"][number]

function padAlternativasFour(alts: string[]) {
  const a = [...alts]
  while (a.length < 4) a.push("")
  return a.slice(0, 4)
}

type BotConfig = {
  defaultChannelId?: string
  defaultQuestionTime?: number
  rankingEnabled?: boolean
}

type NavId = "inicio" | "quizzes" | "config" | "fluxo"

const NAV_ITEMS: { id: NavId; label: string; icon: string }[] = [
  { id: "inicio", label: "Início", icon: "⌂" },
  { id: "quizzes", label: "Quizzes", icon: "◫" },
  { id: "config", label: "Bot", icon: "◎" },
  { id: "fluxo", label: "Guia", icon: "↗" },
]

const PAGE_META: Record<NavId, { title: string; sub: string }> = {
  inicio: { title: "Visão geral", sub: "Status ao vivo e preferências do painel" },
  quizzes: { title: "Quizzes", sub: "Crie, edite e organize perguntas para o Discord" },
  config: { title: "Bot", sub: "Canal padrão, tempo e ranking no servidor" },
  fluxo: { title: "Guia rápido", sub: "Do painel ao quiz rodando no canal" },
}

export function QuizPanel() {
  const [nav, setNav] = useState<NavId>("inicio")
  const [config, setConfig] = useState<BotConfig>({})
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [newQuiz, setNewQuiz] = useState({ titulo: "", descricao: "", tempoPadrao: 20, pontosPadrao: 1 })
  const [cfgForm, setCfgForm] = useState({ defaultChannelId: "", defaultQuestionTime: 20, rankingEnabled: true })
  const [expandedQuizId, setExpandedQuizId] = useState<string | null>(null)
  const [editingQuestionKey, setEditingQuestionKey] = useState<string | null>(null)
  const [editQuestionDraft, setEditQuestionDraft] = useState<{
    enunciado: string
    alternativas: string[]
    corretaIndex: number
    tempo: number
    pontos: number
  } | null>(null)
  const [questionListFilter, setQuestionListFilter] = useState("")
  const [quizMetaForm, setQuizMetaForm] = useState({
    titulo: "",
    descricao: "",
    tempoPadrao: 20,
    pontosPadrao: 1,
  })
  const lastExpandedRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showTimeCalc, setShowTimeCalc] = useState(() => {
    if (typeof window === "undefined") return true
    return window.localStorage.getItem("showTimeCalc") !== "false"
  })
  const [calcSecondsPerQuestion, setCalcSecondsPerQuestion] = useState(() => {
    if (typeof window === "undefined") return 60
    const n = Number(window.localStorage.getItem("calcSecondsPerQuestion"))
    return Number.isFinite(n) && n > 0 ? n : 60
  })
  const [statusIntervalSec, setStatusIntervalSec] = useState(() => {
    if (typeof window === "undefined") return 1
    const n = Number(window.localStorage.getItem("statusIntervalSec"))
    return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.floor(n))) : 1
  })
  const [statusOnlyWhenActive, setStatusOnlyWhenActive] = useState(() => {
    if (typeof window === "undefined") return true
    return window.localStorage.getItem("statusOnlyWhenActive") !== "false"
  })

  const formatDuration = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds))
    const m = Math.floor(s / 60)
    const r = s % 60
    return m > 0 ? `${m}m ${r}s` : `${r}s`
  }

  const notify = (m: { type: "success" | "error"; text: string }) => {
    setMessage(m)
    setTimeout(() => setMessage(null), m.type === "error" ? 6000 : 4000)
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("showTimeCalc", String(showTimeCalc))
  }, [showTimeCalc])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("calcSecondsPerQuestion", String(calcSecondsPerQuestion))
  }, [calcSecondsPerQuestion])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("statusIntervalSec", String(statusIntervalSec))
  }, [statusIntervalSec])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("statusOnlyWhenActive", String(statusOnlyWhenActive))
  }, [statusOnlyWhenActive])

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const data = await quizApi.getConfig();
        setConfig(data.config ?? {});
        setCfgForm({
          defaultChannelId: data.config?.defaultChannelId ?? "",
          defaultQuestionTime: data.config?.defaultQuestionTime ?? 20,
          rankingEnabled: data.config?.rankingEnabled ?? true,
        });
      } catch {
        /* ignore */
      }
    };
    const loadQuizzes = async () => {
      try {
        const data = await quizApi.listQuizzes();
        setQuizzes(data.quizzes ?? []);
      } catch {
        /* ignore */
      }
    };
    loadConfig();
    loadQuizzes();
  }, []);

  useEffect(() => {
    if (expandedQuizId !== lastExpandedRef.current) {
      lastExpandedRef.current = expandedQuizId
      setEditingQuestionKey(null)
      setEditQuestionDraft(null)
      setQuestionListFilter("")
      if (expandedQuizId) {
        const q = quizzes.find((x) => x.id === expandedQuizId)
        if (q) {
          setQuizMetaForm({
            titulo: q.titulo,
            descricao: q.descricao ?? "",
            tempoPadrao: q.tempoPadrao ?? 20,
            pontosPadrao: q.pontosPadrao ?? 1,
          })
        }
      }
    }
  }, [expandedQuizId, quizzes])

  useEffect(() => {
    if (!editingQuestionKey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditingQuestionKey(null)
        setEditQuestionDraft(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editingQuestionKey])

  const startEditQuestion = (quizId: string, pergunta: QuestionRow, defaults: Quiz) => {
    setEditingQuestionKey(`${quizId}:${pergunta.id}`)
    setEditQuestionDraft({
      enunciado: pergunta.enunciado,
      alternativas: padAlternativasFour(pergunta.alternativas ?? []),
      corretaIndex: Math.min(pergunta.corretaIndex ?? 0, Math.max(0, (pergunta.alternativas?.length ?? 1) - 1)),
      tempo: pergunta.tempo ?? defaults.tempoPadrao ?? 20,
      pontos: pergunta.pontos ?? defaults.pontosPadrao ?? 1,
    })
  }

  const cancelEditQuestion = () => {
    setEditingQuestionKey(null)
    setEditQuestionDraft(null)
  }

  const saveEditQuestion = async (quizId: string, questionId: string) => {
    if (!editQuestionDraft) return
    if (!editQuestionDraft.enunciado.trim()) {
      notify({ type: "error", text: "Preencha o enunciado." })
      return
    }
    const alternativas = editQuestionDraft.alternativas.map((a) => a.trim()).filter(Boolean)
    if (alternativas.length < 2) {
      notify({ type: "error", text: "Preencha pelo menos 2 alternativas." })
      return
    }
    let corretaIndex = editQuestionDraft.corretaIndex
    if (corretaIndex < 0 || corretaIndex >= alternativas.length) corretaIndex = 0
    try {
      setLoading(true);
      const data = await quizApi.updateQuestion(quizId, questionId, {
        enunciado: editQuestionDraft.enunciado,
        alternativas,
        corretaIndex,
        tempo: editQuestionDraft.tempo,
        pontos: editQuestionDraft.pontos,
      });
      if (!data.ok) throw new Error("Erro ao salvar");
      setQuizzes((q) =>
        q.map((qz) => (qz.id === quizId ? { ...qz, perguntas: data.quiz.perguntas } : qz)),
      );
      cancelEditQuestion()
      notify({ type: "success", text: "Pergunta atualizada." })
    } catch (e) {
      notify({
        type: "error",
        text: e instanceof Error ? e.message : "Erro ao atualizar pergunta.",
      })
    } finally {
      setLoading(false)
    }
  }

  const duplicateQuestion = async (quizId: string, pergunta: QuestionRow) => {
    try {
      setLoading(true);
      const data = await quizApi.addQuestion(quizId, {
        enunciado: pergunta.enunciado,
        alternativas: pergunta.alternativas,
        corretaIndex: pergunta.corretaIndex,
        tempo: pergunta.tempo,
        pontos: pergunta.pontos,
      });
      if (!data.ok) throw new Error("dup");
      setQuizzes((q) =>
        q.map((qz) => (qz.id === quizId ? { ...qz, perguntas: data.quiz.perguntas } : qz)),
      );
      notify({ type: "success", text: "Pergunta duplicada." })
    } catch {
      notify({ type: "error", text: "Erro ao duplicar pergunta." })
    } finally {
      setLoading(false)
    }
  }

  const saveQuizMeta = async (quizId: string) => {
    try {
      setLoading(true);
      const data = await quizApi.patchQuiz(quizId, {
        titulo: quizMetaForm.titulo,
        descricao: quizMetaForm.descricao,
        tempoPadrao: quizMetaForm.tempoPadrao,
        pontosPadrao: quizMetaForm.pontosPadrao,
      });
      if (!data.ok) throw new Error("meta");
      setQuizzes((list) => list.map((x) => (x.id === quizId ? data.quiz : x)));
      setQuizMetaForm({
        titulo: data.quiz.titulo,
        descricao: data.quiz.descricao ?? "",
        tempoPadrao: data.quiz.tempoPadrao ?? 20,
        pontosPadrao: data.quiz.pontosPadrao ?? 1,
      })
      notify({ type: "success", text: "Dados do quiz salvos." })
    } catch {
      notify({ type: "error", text: "Erro ao salvar dados do quiz." })
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setLoading(true);
      const data = await quizApi.saveConfig(cfgForm);
      setConfig(data.config);
      notify({ type: "success", text: "Configuração salva." })
    } catch {
      notify({ type: "error", text: "Erro ao salvar. A API está rodando?" })
    } finally {
      setLoading(false)
    }
  }

  const createQuiz = async () => {
    if (!newQuiz.titulo.trim()) {
      notify({ type: "error", text: "Informe o título do quiz." })
      return
    }
    try {
      setLoading(true);
      const data = await quizApi.createQuiz(newQuiz);
      if (data.quiz) {
        const created = data.quiz;
        setQuizzes((q) => [...q, created]);
        setNewQuiz({ titulo: "", descricao: "", tempoPadrao: 20, pontosPadrao: 1 });
        setExpandedQuizId(created.id);
        setNav("quizzes")
        notify({ type: "success", text: `Quiz “${created.titulo}” criado.` });
      }
    } catch {
      notify({ type: "error", text: "Não foi possível criar o quiz." })
    } finally {
      setLoading(false)
    }
  }

  const deleteQuestion = async (quizId: string, questionId: string) => {
    try {
      setLoading(true);
      const data = await quizApi.deleteQuestion(quizId, questionId);
      if (data.ok) {
        setQuizzes((q) => q.map((qz) => (qz.id === quizId ? { ...qz, perguntas: data.quiz.perguntas } : qz)))
        notify({ type: "success", text: "Pergunta removida." })
      }
    } catch {
      notify({ type: "error", text: "Erro ao remover pergunta." })
    } finally {
      setLoading(false)
    }
  }

  const deleteQuiz = async (quizId: string) => {
    if (!confirm("Excluir este quiz permanentemente?")) return
    try {
      setLoading(true);
      const data = await quizApi.deleteQuiz(quizId);
      if (data.ok) {
        setQuizzes((q) => q.filter((qz) => qz.id !== quizId))
        if (expandedQuizId === quizId) setExpandedQuizId(null)
        notify({ type: "success", text: "Quiz excluído." })
      }
    } catch {
      notify({ type: "error", text: "Erro ao excluir quiz." })
    } finally {
      setLoading(false)
    }
  }

  const meta = PAGE_META[nav]

  return (
    <div className="quiz-app shell">
      {message ? (
        <div className={`toast ${message.type}`} role="status">
          {message.text}
        </div>
      ) : null}

      <header className="dock dock-integrated">
        <nav className="dock-nav" aria-label="Navegação do quiz">
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={nav === id ? "dock-link active" : "dock-link"}
              onClick={() => setNav(id)}
            >
              <span className="dock-link-icon" aria-hidden>
                {icon}
              </span>
              {label}
            </button>
          ))}
        </nav>

        <div className="dock-end">
          <span className="stat-chip">
            <span className="stat-chip-dot" />
            {quizzes.length} {quizzes.length === 1 ? "quiz" : "quizzes"}
          </span>
        </div>
      </header>

      <div className="viewport">
        {nav !== "inicio" ? (
          <header className="page-hero page-hero-compact">
            <div>
              <h1 className="page-title" key={nav}>
                {meta.title}
              </h1>
              <p className="page-sub">{meta.sub}</p>
            </div>
          </header>
        ) : null}

        <main className="page-content" key={nav}>
          {nav === "inicio" && (
            <div className="home-grid">
              <section className="panel home-top">
                <div className="home-top-copy">
                  <span className="panel-tag">Discord · Ao vivo</span>
                  <h1 className="home-title">Visão geral</h1>
                  <p className="home-lead">Monte quizzes aqui — o bot usa os mesmos dados no canal.</p>
                  <div className="home-stats">
                    <div className="home-stat">
                      <strong>{quizzes.length}</strong>
                      <span>quizzes</span>
                    </div>
                    <div className="home-stat">
                      <strong>{quizzes.reduce((n, q) => n + (q.perguntas?.length ?? 0), 0)}</strong>
                      <span>perguntas</span>
                    </div>
                  </div>
                  <div className="cta-row">
                    <button type="button" className="btn primary" onClick={() => setNav("quizzes")}>
                      Criar quiz
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setNav("fluxo")}>
                      Guia
                    </button>
                  </div>
                </div>
                <div className="home-top-live">
                  <StatusPanel
                    intervalMs={statusIntervalSec * 1000}
                    activeOnly={statusOnlyWhenActive}
                    inactiveIntervalMs={5000}
                  />
                </div>
              </section>

              <section className="panel home-settings">
                <span className="panel-tag">Painel</span>
                <div className="home-settings-row">
                  <label className="field inline">
                    <span>Atualizar a cada (s)</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={statusIntervalSec}
                      onChange={(e) => setStatusIntervalSec(Number(e.target.value))}
                    />
                  </label>
                  <label className="field checkbox inline">
                    <input
                      type="checkbox"
                      checked={statusOnlyWhenActive}
                      onChange={(e) => setStatusOnlyWhenActive(e.target.checked)}
                    />
                    <span>Só acelerar com quiz ativo</span>
                  </label>
                </div>
              </section>
            </div>
          )}

          {nav === "config" && (
            <section className="panel panel-narrow">
              <div className="panel-head">
                <span className="panel-tag">Discord</span>
                <h3>Canal padrão e tempos</h3>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>ID do canal padrão</span>
                  <input
                    type="text"
                    value={cfgForm.defaultChannelId}
                    onChange={(e) => setCfgForm((f) => ({ ...f, defaultChannelId: e.target.value }))}
                    placeholder="Cole o ID do canal"
                  />
                </label>
                <div className="field full-width">
                  <SmartTimePicker
                    variant="inline"
                    label="Tempo padrão no Discord"
                    value={cfgForm.defaultQuestionTime}
                    onChange={(defaultQuestionTime) => setCfgForm((f) => ({ ...f, defaultQuestionTime }))}
                    hint="Quando o bot inicia sem tempo por pergunta."
                  />
                </div>
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    checked={cfgForm.rankingEnabled}
                    onChange={(e) => setCfgForm((f) => ({ ...f, rankingEnabled: e.target.checked }))}
                  />
                  <span>Ranking ao final</span>
                </label>
              </div>
              <button type="button" className="btn primary sm" onClick={() => void saveConfig()} disabled={loading}>
                Salvar
              </button>
              <p className="muted small" style={{ marginTop: "1rem" }}>
                Atual: canal {config.defaultChannelId || "—"} · {config.defaultQuestionTime ?? 20}s · ranking{" "}
                {config.rankingEnabled ? "sim" : "não"}
              </p>
            </section>
          )}

          {nav === "quizzes" && (
            <div className="split-page">
              <aside className="split-aside">
              <section className="panel panel-create">
                <div className="panel-head panel-head-min">
                  <h3>Novo quiz</h3>
                </div>
                <form
                  className="create-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void createQuiz()
                  }}
                >
                  <label className="field">
                    <span>Título</span>
                    <input
                      type="text"
                      value={newQuiz.titulo}
                      onChange={(e) => setNewQuiz((q) => ({ ...q, titulo: e.target.value }))}
                      placeholder="Ex.: Trívia de sexta"
                      autoFocus
                    />
                  </label>
                  <label className="field">
                    <span>Descrição</span>
                    <textarea
                      rows={2}
                      value={newQuiz.descricao}
                      onChange={(e) => setNewQuiz((q) => ({ ...q, descricao: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </label>
                  <div className="create-form-row">
                    <SmartTimePicker
                      variant="inline"
                      label="Tempo"
                      value={newQuiz.tempoPadrao}
                      onChange={(tempoPadrao) => setNewQuiz((q) => ({ ...q, tempoPadrao }))}
                      presets={[15, 20, 30, 35, 45, 60]}
                    />
                    <label className="field">
                      <span>Pontos</span>
                      <input
                        type="number"
                        min={1}
                        value={newQuiz.pontosPadrao}
                        onChange={(e) => setNewQuiz((q) => ({ ...q, pontosPadrao: Number(e.target.value) }))}
                      />
                    </label>
                  </div>
                  <button type="submit" className="btn primary btn-block" disabled={loading}>
                    {loading ? "Criando…" : "Criar quiz"}
                  </button>
                </form>
              </section>
              </aside>

              <div className="split-main">
              <section className="panel">
                <div className="panel-head panel-head-tools">
                  <div className="panel-head-left">
                    <h3>Biblioteca</h3>
                    <span className="count-badge">{quizzes.length}</span>
                  </div>
                  <label className="field checkbox tool-toggle">
                    <input
                      type="checkbox"
                      checked={showTimeCalc}
                      onChange={(e) => setShowTimeCalc(e.target.checked)}
                    />
                    <span>Estimativa ~</span>
                  </label>
                </div>
                {showTimeCalc ? (
                  <div className="list-tools">
                    <SmartTimePicker
                      variant="inline"
                      label="Segundos simulados por pergunta"
                      value={calcSecondsPerQuestion}
                      onChange={setCalcSecondsPerQuestion}
                      min={5}
                      max={300}
                      presets={[20, 30, 35, 45, 60, 90]}
                    />
                  </div>
                ) : null}
                <div className="quiz-list">
                  {quizzes.length === 0 ? (
                    <p className="muted">Nenhum quiz ainda. Crie um acima.</p>
                  ) : (
                    quizzes.map((qz, cardIndex) => (
                      <article
                        className={`quiz-card ${expandedQuizId === qz.id ? "open" : ""}`}
                        key={qz.id}
                        style={{ animationDelay: `${Math.min(cardIndex, 14) * 0.045}s` }}
                      >
                        <div className="quiz-card-head">
                          <div>
                            <h4>{qz.titulo}</h4>
                            <p className="muted small">{qz.descricao || "Sem descrição"}</p>
                            <div className="quiz-meta">
                              <span className="pill">{qz.perguntas?.length ?? 0} perguntas</span>
                              <span className="pill muted-pill">
                                {formatQuizTime(qz.tempoPadrao ?? 20)} · {qz.pontosPadrao ?? 1} pts
                              </span>
                              {showTimeCalc ? (
                                <>
                                  <span className="pill outline">
                                    Σ{" "}
                                    {formatDuration(
                                      (qz.perguntas ?? []).reduce(
                                        (acc, p) => acc + Number(p?.tempo ?? qz.tempoPadrao ?? 20),
                                        0
                                      )
                                    )}
                                  </span>
                                  <span className="pill outline">
                                    ~{formatDuration((qz.perguntas?.length ?? 0) * calcSecondsPerQuestion)}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="quiz-card-actions">
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => setExpandedQuizId(expandedQuizId === qz.id ? null : qz.id)}
                            >
                              {expandedQuizId === qz.id ? "Fechar" : "Editar perguntas"}
                            </button>
                            <button
                              type="button"
                              className="btn danger sm"
                              onClick={() => void deleteQuiz(qz.id)}
                              disabled={loading}
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                        <p className="quiz-id muted tiny">id: {qz.id}</p>

                        {expandedQuizId === qz.id ? (
                          <div className="quiz-card-body">
                            <div className="quiz-meta-form">
                              <h5 className="quiz-meta-title">Dados do quiz</h5>
                              <div className="form-grid two tight">
                                <label className="field">
                                  <span>Título</span>
                                  <input
                                    type="text"
                                    value={quizMetaForm.titulo}
                                    onChange={(e) => setQuizMetaForm((f) => ({ ...f, titulo: e.target.value }))}
                                  />
                                </label>
                                <div className="field full-width">
                                  <SmartTimePicker
                                    variant="inline"
                                    label="Tempo padrão"
                                    value={quizMetaForm.tempoPadrao}
                                    onChange={(tempoPadrao) => setQuizMetaForm((f) => ({ ...f, tempoPadrao }))}
                                    presets={[15, 20, 30, 35, 45, 60]}
                                  />
                                </div>
                                <label className="field">
                                  <span>Pontos padrão</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={quizMetaForm.pontosPadrao}
                                    onChange={(e) =>
                                      setQuizMetaForm((f) => ({ ...f, pontosPadrao: Number(e.target.value) }))
                                    }
                                  />
                                </label>
                                <label className="field full-width">
                                  <span>Descrição</span>
                                  <textarea
                                    rows={2}
                                    value={quizMetaForm.descricao}
                                    onChange={(e) => setQuizMetaForm((f) => ({ ...f, descricao: e.target.value }))}
                                  />
                                </label>
                              </div>
                              <button
                                type="button"
                                className="btn primary sm"
                                onClick={() => void saveQuizMeta(qz.id)}
                                disabled={loading}
                              >
                                Salvar dados do quiz
                              </button>
                            </div>

                            <QuizEditor
                              quiz={qz}
                              loading={loading}
                              onLoading={setLoading}
                              onNotify={notify}
                              onQuizUpdated={(updated) =>
                                setQuizzes((list) => list.map((x) => (x.id === updated.id ? updated : x)))
                              }
                            />
                            {(qz.perguntas?.length ?? 0) > 0 ? (
                              <div className="question-list">
                                <div className="question-list-head">
                                  <h5>Perguntas no quiz</h5>
                                  <label className="field filter-field">
                                    <span className="sr-only">Filtrar</span>
                                    <input
                                      type="search"
                                      placeholder="Filtrar por texto…"
                                      value={questionListFilter}
                                      onChange={(e) => setQuestionListFilter(e.target.value)}
                                    />
                                  </label>
                                </div>
                                {(() => {
                                  const qf = questionListFilter.trim().toLowerCase()
                                  const filtered = qf
                                    ? qz.perguntas.filter(
                                        (p) =>
                                          p.enunciado.toLowerCase().includes(qf) ||
                                          (p.alternativas ?? []).some((a) => a.toLowerCase().includes(qf))
                                      )
                                    : qz.perguntas
                                  if (filtered.length === 0) {
                                    return <p className="muted small">Nenhuma pergunta corresponde ao filtro.</p>
                                  }
                                  return filtered.map((pergunta) => {
                                    const idx = qz.perguntas.indexOf(pergunta)
                                    const ekey = `${qz.id}:${pergunta.id}`
                                    const isEditing = editingQuestionKey === ekey && editQuestionDraft
                                    return (
                                      <div className="q-item" key={pergunta.id}>
                                        {isEditing && editQuestionDraft ? (
                                          <div className="q-edit-form">
                                            <p className="muted tiny">Esc para cancelar</p>
                                            <label className="field">
                                              <span>Enunciado</span>
                                              <textarea
                                                rows={3}
                                                value={editQuestionDraft.enunciado}
                                                onChange={(e) =>
                                                  setEditQuestionDraft((d) =>
                                                    d ? { ...d, enunciado: e.target.value } : d
                                                  )
                                                }
                                              />
                                            </label>
                                            <label className="field">
                                              <span>Alternativas</span>
                                              {editQuestionDraft.alternativas.map((alt, j) => (
                                                <div className="alt-row" key={j}>
                                                  <input
                                                    type="radio"
                                                    name={`edit-correta-${pergunta.id}`}
                                                    checked={editQuestionDraft.corretaIndex === j}
                                                    onChange={() =>
                                                      setEditQuestionDraft((d) =>
                                                        d ? { ...d, corretaIndex: j } : d
                                                      )
                                                    }
                                                  />
                                                  <input
                                                    type="text"
                                                    value={alt}
                                                    onChange={(e) => {
                                                      const novas = [...editQuestionDraft.alternativas]
                                                      novas[j] = e.target.value
                                                      setEditQuestionDraft((d) =>
                                                        d ? { ...d, alternativas: novas } : d
                                                      )
                                                    }}
                                                    placeholder={`Alternativa ${String.fromCharCode(65 + j)}`}
                                                  />
                                                </div>
                                              ))}
                                            </label>
                                            <div className="form-grid two tight">
                                              <div className="field">
                                                <SmartTimePicker
                                                  variant="inline"
                                                  label="Tempo"
                                                  value={editQuestionDraft.tempo}
                                                  onChange={(tempo) =>
                                                    setEditQuestionDraft((d) => (d ? { ...d, tempo } : d))
                                                  }
                                                  presets={[15, 20, 30, 35, 45, 60]}
                                                />
                                              </div>
                                              <label className="field">
                                                <span>Pontos</span>
                                                <input
                                                  type="number"
                                                  min={1}
                                                  value={editQuestionDraft.pontos}
                                                  onChange={(e) =>
                                                    setEditQuestionDraft((d) =>
                                                      d ? { ...d, pontos: Number(e.target.value) } : d
                                                    )
                                                  }
                                                />
                                              </label>
                                            </div>
                                            <div className="cta-row">
                                              <button
                                                type="button"
                                                className="btn primary sm"
                                                onClick={() => void saveEditQuestion(qz.id, pergunta.id)}
                                                disabled={loading}
                                              >
                                                Salvar
                                              </button>
                                              <button
                                                type="button"
                                                className="btn ghost sm"
                                                onClick={cancelEditQuestion}
                                                disabled={loading}
                                              >
                                                Cancelar
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            <div className="q-item-head">
                                              <span className="q-num">{idx + 1}</span>
                                              <p className="q-title">{pergunta.enunciado}</p>
                                              <div className="q-item-actions">
                                                <button
                                                  type="button"
                                                  className="btn ghost sm"
                                                  onClick={() => startEditQuestion(qz.id, pergunta, qz)}
                                                  disabled={loading}
                                                >
                                                  Editar
                                                </button>
                                                <button
                                                  type="button"
                                                  className="btn ghost sm"
                                                  onClick={() => void duplicateQuestion(qz.id, pergunta)}
                                                  disabled={loading}
                                                >
                                                  Duplicar
                                                </button>
                                                <button
                                                  type="button"
                                                  className="btn danger sm icon-only"
                                                  onClick={() => void deleteQuestion(qz.id, pergunta.id)}
                                                  disabled={loading}
                                                  title="Remover"
                                                >
                                                  ×
                                                </button>
                                              </div>
                                            </div>
                                            <ul className="q-alts">
                                              {pergunta.alternativas?.map((alt, j) => (
                                                <li
                                                  key={j}
                                                  className={pergunta.corretaIndex === j ? "correct" : ""}
                                                >
                                                  <span className="letter">{String.fromCharCode(65 + j)}</span>
                                                  {alt}
                                                </li>
                                              ))}
                                            </ul>
                                            <p className="muted tiny">
                                              {formatQuizTime(pergunta.tempo ?? qz.tempoPadrao ?? 20)} ·{" "}
                                              {pergunta.pontos ?? qz.pontosPadrao ?? 1} pts
                                            </p>
                                          </>
                                        )}
                                      </div>
                                    )
                                  })
                                })()}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </section>
              </div>
            </div>
          )}

          {nav === "fluxo" && (
            <section className="panel">
              <div className="flow-grid">
                {[
                  ["1", "Bot no servidor", "Convide o bot e use /quiz start com o ID do quiz."],
                  ["2", "Monte aqui", "Uma a uma, colando várias ou com IA — tudo vira pergunta no mesmo quiz."],
                  ["3", "Canal", "Indique o canal no comando ou use o padrão salvo em Bot."],
                  ["4", "Ranking", "Ao terminar, o bot publica o top no Discord."],
                ].map(([step, title, desc], i) => (
                  <article
                    key={step}
                    className="flow-step"
                    style={{ animationDelay: `${i * 0.07}s` }}
                  >
                    <span className="flow-step-num">{step}</span>
                    <h4>{title}</h4>
                    <p className="muted small">{desc}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
