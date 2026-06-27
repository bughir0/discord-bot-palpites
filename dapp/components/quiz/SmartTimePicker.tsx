import { useCallback, useId, useRef, type PointerEvent } from "react"
import { clampQuizSeconds, formatQuizTime, formatQuizTimeDigital } from "@/lib/quiz/formatQuizTime";

const DEFAULT_PRESETS = [10, 15, 20, 30, 35, 45, 60, 90, 120]

type SmartTimePickerProps = {
  value: number
  onChange: (seconds: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  presets?: number[]
  /** dial = relógio circular; inline = chips + stepper (formulários) */
  variant?: "dial" | "inline"
  compact?: boolean
  hint?: string
}

function valueToAngle(value: number, min: number, max: number): number {
  const ratio = (clampQuizSeconds(value, min, max) - min) / Math.max(1, max - min)
  return ratio * 360 - 90
}

function angleToValue(angleDeg: number, min: number, max: number, step: number): number {
  let a = angleDeg + 90
  while (a < 0) a += 360
  a %= 360
  const ratio = a / 360
  const raw = min + ratio * (max - min)
  const stepped = Math.round(raw / step) * step
  return clampQuizSeconds(stepped, min, max)
}

function pointerToAngle(clientX: number, clientY: number, rect: DOMRect): number {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const rad = Math.atan2(clientY - cy, clientX - cx)
  return (rad * 180) / Math.PI
}

export function SmartTimePicker({
  value,
  onChange,
  min = 5,
  max = 180,
  step = 5,
  label,
  presets = DEFAULT_PRESETS,
  variant = "dial",
  compact = false,
  hint,
}: SmartTimePickerProps) {
  const dialRef = useRef<HTMLButtonElement>(null)
  const dragging = useRef(false)
  const fieldId = useId()
  const safe = clampQuizSeconds(value, min, max)
  const digital = formatQuizTimeDigital(safe)
  const angle = valueToAngle(safe, min, max)
  const progress = ((safe - min) / Math.max(1, max - min)) * 100
  const size = compact ? 108 : 148
  const r = compact ? 42 : 58
  const cx = size / 2
  const cy = size / 2
  const handLen = r - (compact ? 6 : 10)
  const handRad = (angle * Math.PI) / 180
  const handX = cx + handLen * Math.cos(handRad)
  const handY = cy + handLen * Math.sin(handRad)
  const arcLen = 2 * Math.PI * r
  const dashOffset = arcLen * (1 - progress / 100)

  const setFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = dialRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const deg = pointerToAngle(clientX, clientY, rect)
      onChange(angleToValue(deg, min, max, step))
    },
    [max, min, onChange, step]
  )

  const onDialPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromPointer(e.clientX, e.clientY)
  }

  const onDialPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return
    setFromPointer(e.clientX, e.clientY)
  }

  const onDialPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const bump = (delta: number) => onChange(clampQuizSeconds(safe + delta, min, max))

  const visiblePresets = presets.filter((p) => p >= min && p <= max)
  const inlinePresets = variant === "inline" ? visiblePresets.slice(0, 6) : visiblePresets

  if (variant === "inline") {
    return (
      <div className="time-inline">
        {label ? (
          <span className="time-inline-label" id={fieldId}>
            {label}
          </span>
        ) : null}
        <div className="time-inline-row">
          <button type="button" className="time-inline-step" onClick={() => bump(-step)} aria-label="Menos">
            −
          </button>
          <span className="time-inline-value" aria-live="polite">
            {formatQuizTime(safe)}
          </span>
          <button type="button" className="time-inline-step" onClick={() => bump(step)} aria-label="Mais">
            +
          </button>
        </div>
        <div className="time-inline-presets" role="group" aria-label="Atalhos de tempo">
          {inlinePresets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`time-inline-preset ${safe === preset ? "active" : ""}`}
              onClick={() => onChange(preset)}
            >
              {formatQuizTime(preset)}
            </button>
          ))}
        </div>
        {hint ? <p className="time-inline-hint">{hint}</p> : null}
      </div>
    )
  }

  return (
    <div className={`smart-time-picker ${compact ? "compact" : ""}`}>
      {label ? (
        <span className="smart-time-label" id={fieldId}>
          {label}
        </span>
      ) : null}

      <div className="smart-time-body">
        <button
          type="button"
          className="smart-time-step"
          aria-label={`Diminuir ${step} segundos`}
          onClick={() => bump(-step)}
        >
          −
        </button>

        <button
          type="button"
          ref={dialRef}
          className="smart-time-dial"
          aria-labelledby={label ? fieldId : undefined}
          aria-valuenow={safe}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-label={`Tempo: ${formatQuizTime(safe)}. Arraste o ponteiro para ajustar.`}
          onPointerDown={onDialPointerDown}
          onPointerMove={onDialPointerMove}
          onPointerUp={onDialPointerUp}
          onPointerCancel={onDialPointerUp}
          style={{ width: size, height: size }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
            <circle
              className="smart-time-track"
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              strokeWidth={compact ? 5 : 7}
            />
            <circle
              className="smart-time-progress"
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              strokeWidth={compact ? 5 : 7}
              strokeDasharray={arcLen}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            {Array.from({ length: 12 }, (_, i) => {
              const tickAngle = ((i / 12) * 360 - 90) * (Math.PI / 180)
              const x1 = cx + (r - 4) * Math.cos(tickAngle)
              const y1 = cy + (r - 4) * Math.sin(tickAngle)
              const x2 = cx + r * Math.cos(tickAngle)
              const y2 = cy + r * Math.sin(tickAngle)
              return (
                <line
                  key={i}
                  className="smart-time-tick"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={i % 3 === 0 ? 2 : 1}
                />
              )
            })}
            <line
              className="smart-time-hand"
              x1={cx}
              y1={cy}
              x2={handX}
              y2={handY}
              strokeWidth={compact ? 2.5 : 3}
            />
            <circle className="smart-time-hub" cx={cx} cy={cy} r={compact ? 4 : 5} />
            <circle className="smart-time-knob" cx={handX} cy={handY} r={compact ? 5 : 7} />
          </svg>
          <div className="smart-time-display">
            <span className="smart-time-main">{digital.main}</span>
            <span className="smart-time-sub">{digital.sub}</span>
          </div>
        </button>

        <button
          type="button"
          className="smart-time-step"
          aria-label={`Aumentar ${step} segundos`}
          onClick={() => bump(step)}
        >
          +
        </button>
      </div>

      <div className="smart-time-presets" role="group" aria-label="Atalhos de tempo">
        {visiblePresets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`smart-time-preset ${safe === preset ? "active" : ""}`}
            onClick={() => onChange(preset)}
          >
            {formatQuizTime(preset)}
          </button>
        ))}
      </div>

      {!compact ? (
        <input
          type="range"
          className="smart-time-slider"
          min={min}
          max={max}
          step={step}
          value={safe}
          onChange={(e) => onChange(clampQuizSeconds(Number(e.target.value), min, max))}
          aria-label="Ajuste fino do tempo"
        />
      ) : null}

      {hint ? <p className="smart-time-hint">{hint}</p> : null}
    </div>
  )
}
