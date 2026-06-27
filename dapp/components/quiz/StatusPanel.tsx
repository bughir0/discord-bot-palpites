import { useEffect, useRef, useState } from "react";
import { quizApi, type QuizStatus } from "@/lib/quiz-api";

const fallbackStatus: QuizStatus = {
  quiz: "Carregando...",
  atual: { numero: 0, total: 0, enunciado: "", tempoRestante: "--", terminaEm: null },
  proxima: { numero: 0, enunciado: "", prevista: "--", timestamp: null },
  progresso: 0,
  participantes: 0,
}

const formatTime = (ms: number) => {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return `${ms}`
  }
}

function sameStatus(a: QuizStatus | null, b: QuizStatus): boolean {
  if (!a) return false
  return (
    a.quiz === b.quiz &&
    a.progresso === b.progresso &&
    (a.participantes ?? 0) === (b.participantes ?? 0) &&
    a.atual.numero === b.atual.numero &&
    a.atual.total === b.atual.total &&
    a.atual.enunciado === b.atual.enunciado &&
    a.atual.tempoRestante === b.atual.tempoRestante &&
    (a.atual.terminaEm ?? null) === (b.atual.terminaEm ?? null) &&
    a.proxima.numero === b.proxima.numero &&
    a.proxima.enunciado === b.proxima.enunciado &&
    a.proxima.prevista === b.proxima.prevista &&
    (a.proxima.timestamp ?? null) === (b.proxima.timestamp ?? null)
  )
}

function isActiveQuiz(s: QuizStatus): boolean {
  if (!s.quiz) return false
  const q = s.quiz.toLowerCase()
  if (q.includes("nenhum quiz ativo") || q.includes("carregando")) return false
  if (s.atual?.total === 0 && s.atual?.numero === 0) return false
  return true
}

function clipText(text: string, max = 72): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function StatusPanel({
  intervalMs,
  activeOnly,
  inactiveIntervalMs = 5000,
}: {
  intervalMs: number;
  activeOnly: boolean;
  inactiveIntervalMs?: number;
}) {
  const [status, setStatus] = useState<QuizStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const inflight = useRef<AbortController | null>(null)
  const statusRef = useRef<QuizStatus | null>(null)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    let cancelled = false
    let timeoutId: number | null = null

    const scheduleNext = (ms: number) => {
      if (cancelled) return
      timeoutId = window.setTimeout(tick, ms)
    }

    const tick = async () => {
      if (cancelled) return

      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        scheduleNext(2000)
        return
      }

      try {
        setLoadingStatus(true)
        inflight.current?.abort()
        const controller = new AbortController()
        inflight.current = controller

        const data = await quizApi.getStatus(controller.signal);

        const next: QuizStatus = {
          quiz: data.quiz,
          atual: data.atual,
          proxima: data.proxima,
          progresso: data.progresso,
          participantes: data.participantes,
        }

        if (!sameStatus(statusRef.current, next)) {
          setStatus(next)
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Erro ao buscar status do quiz", err)
        }
      } finally {
        setLoadingStatus(false)
        const current = statusRef.current ?? status ?? fallbackStatus
        const active = isActiveQuiz(current)
        const nextMs = activeOnly && !active ? inactiveIntervalMs : intervalMs
        scheduleNext(nextMs)
      }
    }

    tick()

    const onVisibility = () => {
      if (cancelled) return
      if (document.visibilityState === "visible") {
        inflight.current?.abort()
        tick()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
      inflight.current?.abort()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [intervalMs, activeOnly, inactiveIntervalMs]);

  const quizStatus = status ?? fallbackStatus
  const active = isActiveQuiz(quizStatus)
  const pct = Math.round(Math.min(1, Math.max(0, quizStatus.progresso)) * 100)
  const timer = quizStatus.atual.tempoRestante?.trim() || "--"
  const hasTimer = timer !== "--" && timer.length > 0

  return (
    <div className={`status-panel ${active ? "is-live" : "is-idle"} ${loadingStatus ? "is-loading" : ""}`}>
      <div className="status-top">
        <div className="status-top-main">
          <span className={`status-live-dot ${active ? "on" : ""}`} aria-hidden />
          <div className="status-top-text">
            <span className="status-kicker">{active ? "Ao vivo" : "Sem quiz ativo"}</span>
            <strong className="status-quiz-name">
              {active ? clipText(quizStatus.quiz, 42) : loadingStatus ? "Conectando…" : "Nenhum quiz rodando"}
            </strong>
          </div>
        </div>
        {active ? (
          <div className={`status-timer ${hasTimer ? "has-value" : ""}`} title="Tempo restante">
            <span className="status-timer-val">{timer}</span>
            <span className="status-timer-lbl">restante</span>
          </div>
        ) : (
          <span className="status-sync">{loadingStatus ? "…" : "●"}</span>
        )}
      </div>

      {active ? (
        <>
          <div className="status-progress-wrap">
            <div className="status-progress-meta">
              <span>
                Pergunta {quizStatus.atual.numero} de {quizStatus.atual.total}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {quizStatus.atual.enunciado ? (
            <p className="status-question">{clipText(quizStatus.atual.enunciado, 120)}</p>
          ) : null}

          <div className="status-meta-row">
            {quizStatus.proxima.numero > 0 ? (
              <span className="status-meta-item">
                Próxima <strong>#{quizStatus.proxima.numero}</strong>
                {quizStatus.proxima.prevista && quizStatus.proxima.prevista !== "--"
                  ? ` · ${quizStatus.proxima.prevista}`
                  : ""}
              </span>
            ) : null}
            {quizStatus.participantes !== undefined && quizStatus.participantes > 0 ? (
              <span className="status-meta-item">
                <strong>{quizStatus.participantes}</strong> jogando
              </span>
            ) : null}
            {quizStatus.atual.terminaEm ? (
              <span className="status-meta-item">até {formatTime(quizStatus.atual.terminaEm)}</span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="status-idle-hint">
          Inicie um quiz no Discord com <code>/quiz start</code> para ver o progresso aqui.
        </p>
      )}
    </div>
  )
}
