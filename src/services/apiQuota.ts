import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config';
import { log } from '../utils/logger';

interface QuotaFile {
  date: string;
  count: number;
}

const QUOTA_PATH = path.join(path.dirname(env.databasePath), 'api-quota.json');
const TZ = 'America/Sao_Paulo';
const ALERT_THRESHOLD = 0.8;

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function readQuota(): QuotaFile {
  try {
    const raw = fs.readFileSync(QUOTA_PATH, 'utf8');
    const data = JSON.parse(raw) as QuotaFile;
    if (data.date === todayKey()) return data;
  } catch {
    // arquivo inexistente ou inválido — usa contagem zerada
  }
  return { date: todayKey(), count: 0 };
}

function writeQuota(data: QuotaFile): void {
  fs.mkdirSync(path.dirname(QUOTA_PATH), { recursive: true });
  fs.writeFileSync(QUOTA_PATH, JSON.stringify(data, null, 2));
}

export function getApiUsageToday(): { count: number; limit: number; remaining: number } {
  const { count } = readQuota();
  const limit = env.apiDailyLimit;
  return { count, limit, remaining: Math.max(0, limit - count) };
}

export function canUseApi(): boolean {
  return getApiUsageToday().remaining > 0;
}

let alertaUsoAltoExibido = false;
let dataAlertaExibido = '';

export function registerApiRequest(): void {
  const today = todayKey();
  if (dataAlertaExibido !== today) {
    dataAlertaExibido = today;
    alertaUsoAltoExibido = false;
  }

  const data = readQuota();
  data.count += 1;
  writeQuota(data);

  const { count, limit, remaining } = getApiUsageToday();
  if (remaining === 0) {
    log.warn(`API Futebol: cota diária esgotada (${count}/${limit}).`);
    alertaUsoAltoExibido = false;
    return;
  }
  if (!alertaUsoAltoExibido && count >= Math.floor(limit * ALERT_THRESHOLD)) {
    alertaUsoAltoExibido = true;
    log.warn(`API Futebol: ${count}/${limit} requisições hoje (restam ${remaining}).`);
  }
}
