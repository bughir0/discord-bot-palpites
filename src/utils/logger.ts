import { env } from '../config';

/**
 * Logger centralizado do Palpito.
 *
 * Níveis (do mais verboso ao mais grave): debug → info/success → warn → error
 *
 * Variáveis de ambiente:
 *   LOG_LEVEL            — nível mínimo geral (padrão: info)
 *   LOG_CONSOLE_LEVEL    — o que aparece no terminal (padrão: LOG_LEVEL)
 *   LOG_WEBHOOK_URL           — webhook Discord
 *   LOG_WEBHOOK_MIRROR_CONSOLE — espelha no webhook tudo que vai ao terminal (padrão: true)
 *   LOG_WEBHOOK_MIN_LEVEL     — só usado se MIRROR_CONSOLE=false (padrão: warn)
 */

type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  success: 1,
  warn: 2,
  error: 3,
};

const LEVEL_EMOJI: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '❌',
};

const WEBHOOK_COLOR: Record<LogLevel, number> = {
  debug: 0x99aab5,
  info: 0x5865f2,
  success: 0x57f287,
  warn: 0xfaa61a,
  error: 0xed4245,
};

const WEBHOOK_MAX_PER_MINUTE = 40;
const WEBHOOK_FLUSH_MS = 2000;
const WEBHOOK_MAX_BATCH = 12;
const WEBHOOK_MAX_BODY = 3900;

const LEVEL_TAG: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  success: 'OK   ',
  warn: 'WARN ',
  error: 'ERROR',
};

let consoleMinRank = LEVEL_RANK.info;
let webhookMinRank = LEVEL_RANK.warn;
let mirrorConsole = true;
let webhookUrl: string | null = null;

const throttleMap = new Map<string, number>();
const webhookQueue: Array<{ level: LogLevel; msg: string; at: number }> = [];
let webhookFlushTimer: ReturnType<typeof setTimeout> | null = null;
let webhookSentThisMinute = 0;
let webhookMinuteStart = Date.now();

export function initLogger(): void {
  const general = (env.logLevel ?? 'info').toLowerCase();
  const consoleLevel = (process.env.LOG_CONSOLE_LEVEL ?? general).toLowerCase();
  const webhookLevel = (
    process.env.LOG_WEBHOOK_MIN_LEVEL ??
    env.logWebhookMinLevel ??
    'warn'
  ).toLowerCase();
  consoleMinRank = LEVEL_RANK[consoleLevel as LogLevel] ?? LEVEL_RANK.info;
  webhookMinRank = LEVEL_RANK[webhookLevel as LogLevel] ?? LEVEL_RANK.warn;
  mirrorConsole =
    env.logWebhookMirrorConsole !== false &&
    process.env.LOG_WEBHOOK_MIRROR_CONSOLE !== 'false';
  webhookUrl = env.logWebhookUrl?.trim() || null;
}

function ts(): string {
  return new Date().toLocaleString('pt-BR', { hour12: false });
}

function formatError(err?: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return `\n   ↳ ${err.message}`;
  return `\n   ↳ ${String(err)}`;
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= consoleMinRank;
}

function shouldWebhook(level: LogLevel): boolean {
  if (!webhookUrl) return false;
  const minRank = mirrorConsole ? consoleMinRank : webhookMinRank;
  return LEVEL_RANK[level] >= minRank;
}

function writeConsole(level: LogLevel, msg: string, err?: unknown): boolean {
  if (!shouldEmit(level)) return false;
  const prefix = `${LEVEL_EMOJI[level]} [${ts()}]`;
  const line = `${prefix} ${msg}${formatError(err)}`;
  if (level === 'error') {
    console.error(line);
    return true;
  }
  if (level === 'warn') {
    console.warn(line);
    return true;
  }
  console.log(line);
  return true;
}

function resetWebhookRateLimitIfNeeded(): void {
  const now = Date.now();
  if (now - webhookMinuteStart >= 60_000) {
    webhookMinuteStart = now;
    webhookSentThisMinute = 0;
  }
}

function enqueueWebhook(level: LogLevel, msg: string, err?: unknown): void {
  if (!shouldWebhook(level)) return;
  const fullMsg = err ? `${msg}${formatError(err)}` : msg;
  webhookQueue.push({ level, msg: fullMsg, at: Date.now() });
  scheduleWebhookFlush();
}

function scheduleWebhookFlush(): void {
  if (webhookFlushTimer) return;
  webhookFlushTimer = setTimeout(() => {
    webhookFlushTimer = null;
    void flushWebhookQueue();
  }, WEBHOOK_FLUSH_MS);
}

function formatWebhookTime(at: number): string {
  return new Date(at).toLocaleTimeString('pt-BR', { hour12: false });
}

function formatWebhookLine(entry: { level: LogLevel; msg: string; at: number }): string {
  const tag = LEVEL_TAG[entry.level] ?? 'LOG  ';
  const text = entry.msg.replace(/\n\s*↳\s*/g, '\n       │ ');
  return `[${formatWebhookTime(entry.at)}] ${tag} │ ${text}`;
}

function buildWebhookDescription(batch: typeof webhookQueue): string {
  let body = batch.map(formatWebhookLine).join('\n');
  if (body.length > WEBHOOK_MAX_BODY) {
    body = `${body.slice(0, WEBHOOK_MAX_BODY - 24)}\n... (truncado)`;
  }
  return `\`\`\`log\n${body}\n\`\`\``;
}

function buildWebhookTitle(batch: typeof webhookQueue, highest: LogLevel): string {
  if (batch.length === 1) {
    return `📋 Terminal · ${highest.toUpperCase()}`;
  }
  return `📋 Terminal · ${batch.length} linhas`;
}

async function flushWebhookQueue(): Promise<void> {
  if (!webhookUrl || webhookQueue.length === 0) return;
  resetWebhookRateLimitIfNeeded();
  if (webhookSentThisMinute >= WEBHOOK_MAX_PER_MINUTE) {
    webhookQueue.length = 0;
    return;
  }
  const batch = webhookQueue.splice(0, WEBHOOK_MAX_BATCH);
  const highest = batch.reduce(
    (max, e) => (LEVEL_RANK[e.level] > LEVEL_RANK[max] ? e.level : max),
    batch[0].level,
  );
  const description = buildWebhookDescription(batch);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Palpito Logs',
        embeds: [
          {
            title: buildWebhookTitle(batch, highest),
            description,
            color: WEBHOOK_COLOR[highest],
            timestamp: new Date().toISOString(),
            footer: { text: 'Palpito · espelho do terminal' },
          },
        ],
      }),
    });
    if (res.ok || res.status === 204) {
      webhookSentThisMinute++;
    }
  } catch {
    // Falha silenciosa — evita loop de erro quando webhook/console estão indisponíveis.
  }
  if (webhookQueue.length > 0) {
    scheduleWebhookFlush();
  }
}

function emit(level: LogLevel, msg: string, err?: unknown): void {
  const printed = writeConsole(level, msg, err);
  if (printed) {
    enqueueWebhook(level, msg, err);
  }
}

export const log = {
  debug(msg: string): void {
    emit('debug', msg);
  },
  info(msg: string): void {
    emit('info', msg);
  },
  success(msg: string): void {
    emit('success', msg);
  },
  warn(msg: string, err?: unknown): void {
    emit('warn', msg, err);
  },
  error(msg: string, err?: unknown): void {
    emit('error', msg, err);
  },
  /** Compatibilidade — equivalente a debug (não aparece no terminal por padrão). */
  detail(msg: string): void {
    emit('debug', msg);
  },
  /** Cron/job — só aparece no terminal se LOG_LEVEL=debug. */
  job(emoji: string, nome: string, extra?: string): void {
    emit('debug', `${emoji} ${nome}${extra ? ` · ${extra}` : ''}`);
  },
  /** Emite no máximo uma vez por chave no intervalo (evita spam de crons). */
  once(key: string, intervalMs: number, level: LogLevel, msg: string, err?: unknown): void {
    const now = Date.now();
    const last = throttleMap.get(key) ?? 0;
    if (now - last < intervalMs) return;
    throttleMap.set(key, now);
    emit(level, msg, err);
  },
  /** Resumo de job: info no terminal quando houve ação; silencioso quando não. */
  jobResult(nome: string, acaoRealizada: boolean, resumo: string): void {
    if (!acaoRealizada) return;
    emit('info', `${nome}: ${resumo}`);
  },
};
