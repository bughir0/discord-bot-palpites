#!/usr/bin/env tsx
/**
 * Migra dados legados dos bots separados para o banco unificado Palpito.
 *
 * Uso:
 *   npx tsx scripts/migrate-legacy-data.ts --wallets path/to/wallets.json
 *   npx tsx scripts/migrate-legacy-data.ts --points path/to/database.sqlite
 *   npx tsx scripts/migrate-legacy-data.ts --shop path/to/database.sqlite
 *   npx tsx scripts/migrate-legacy-data.ts --quiz-auto
 *   npx tsx scripts/migrate-legacy-data.ts --events path/to/.env
 *   npx tsx scripts/migrate-legacy-data.ts --events-auto
 *   npx tsx scripts/migrate-legacy-data.ts --auto-local
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { getDb } from '../src/db/database';
import { addRegisteredWallet } from '../src/modules/wallets/store';
import { setSaldo } from '../src/modules/points/store';
import { importQuizFromFile } from '../src/modules/quiz/store';

function migrateWallets(file: string): void {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
    string,
    { username?: string; wallets?: string[] } | string[]
  >;
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const [userId, data] of Object.entries(raw)) {
    const wallets = Array.isArray(data) ? data : (data.wallets ?? []);
    const username = Array.isArray(data) ? userId : (data.username ?? userId);
    for (const w of wallets) {
      const result = addRegisteredWallet(userId, username, String(w), 'manual');
      if (result.ok) ok++;
      else if (result.message.includes('já está')) skip++;
      else fail++;
    }
  }
  console.log(`[migrate] Wallets: ${ok} importadas, ${skip} já existiam, ${fail} falhas — ${file}`);
}

function migratePointsSqlite(file: string): void {
  const src = new Database(file, { readonly: true });
  const rows = src.prepare('SELECT user_id, saldo FROM users').all() as {
    user_id: string;
    saldo: number;
  }[];
  for (const r of rows) {
    setSaldo(r.user_id, r.saldo);
  }
  src.close();
  console.log(`[migrate] ${rows.length} saldos importados de ${file}`);
}

function migratePointsJson(file: string): void {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, number | { saldo: number }>;
  for (const [userId, data] of Object.entries(raw)) {
    const saldo = typeof data === 'number' ? data : (data.saldo ?? 0);
    setSaldo(userId, saldo);
  }
  console.log(`[migrate] Pontos JSON importados de ${file}`);
}

function migrateShopSqlite(file: string): void {
  const src = new Database(file, { readonly: true });
  const db = getDb();
  let items = 0;
  let settings = 0;
  let purchases = 0;

  try {
    const itemRows = src.prepare('SELECT * FROM shop_items').all() as Record<string, unknown>[];
    const insertItem = db.prepare(
      `INSERT INTO shop_items (guild_id, name, description, price, stock, image_url, delivery_type, delivery_role_id, delivery_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of itemRows) {
      insertItem.run(
        row.guild_id,
        row.name,
        row.description ?? null,
        row.price,
        row.stock ?? 0,
        row.image_url ?? null,
        row.delivery_type ?? 'none',
        row.delivery_role_id ?? null,
        row.delivery_text ?? null,
        row.created_at ?? new Date().toISOString(),
        row.updated_at ?? new Date().toISOString(),
      );
      items++;
    }
  } catch {
    /* tabela ausente no legado */
  }

  try {
    const settingRows = src.prepare('SELECT * FROM shop_settings').all() as Record<string, unknown>[];
    const insertSetting = db.prepare(
      `INSERT OR REPLACE INTO shop_settings (guild_id, channel_id, message_id, title, description, image_url, color, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of settingRows) {
      insertSetting.run(
        row.guild_id,
        row.channel_id,
        row.message_id,
        row.title ?? null,
        row.description ?? null,
        row.image_url ?? null,
        row.color ?? null,
        row.updated_at ?? new Date().toISOString(),
      );
      settings++;
    }
  } catch {
    /* tabela ausente */
  }

  try {
    const purchaseRows = src.prepare('SELECT * FROM shop_purchases').all() as Record<string, unknown>[];
    const insertPurchase = db.prepare(
      `INSERT INTO shop_purchases (guild_id, user_id, item_id, quantity, total_price, status, purchase_code, staff_id, delivered_at, delivery_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of purchaseRows) {
      insertPurchase.run(
        row.guild_id,
        row.user_id,
        row.item_id,
        row.quantity,
        row.total_price,
        row.status ?? 'pending',
        row.purchase_code ?? null,
        row.staff_id ?? null,
        row.delivered_at ?? null,
        row.delivery_note ?? null,
        row.created_at ?? new Date().toISOString(),
      );
      purchases++;
    }
  } catch {
    /* tabela ausente */
  }

  src.close();
  console.log(
    `[migrate] Loja: ${items} itens, ${settings} configs, ${purchases} compras — ${file}`,
  );
}

function migrateQuiz(file: string): void {
  const result = importQuizFromFile(file);
  console.log(
    `[migrate] ${result.quizzes} quiz(zes), ${result.questions} pergunta(s) importados de ${file}`,
  );
}

function findLegacyEventsEnvFile(): string | null {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const downloads = path.join(home, 'Downloads');
  try {
    for (const entry of fs.readdirSync(downloads, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/co.?event/i.test(entry.name)) continue;
      const file = path.join(downloads, entry.name, '.env');
      if (fs.existsSync(file)) return file;
    }
  } catch {
    /* Downloads indisponível */
  }
  return null;
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toJsonText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function migrateEventsPostgres(envFile: string): Promise<void> {
  const parsed = dotenv.parse(fs.readFileSync(envFile, 'utf8'));
  const url = parsed.DATABASE_URL;
  if (!url) {
    console.log(`[migrate] DATABASE_URL ausente em ${envFile}`);
    return;
  }

  const db = getDb();
  const existing = (db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c;
  if (existing > 0) {
    console.log(`[migrate] Eventos: ${existing} já existem no SQLite — pulando (apague manualmente se quiser reimportar).`);
    return;
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  try {
    const events = (
      await pool.query(
        `SELECT id, guild_id, name, description, organizer_id, channel_id, embed_message_id,
                started_at, ended_at, planned_duration_seconds, actual_duration_seconds,
                status, created_at, updated_at
         FROM events ORDER BY id`,
      )
    ).rows as Record<string, unknown>[];

    const insertEvent = db.prepare(
      `INSERT INTO events (
        id, guild_id, name, description, organizer_id, channel_id, embed_message_id,
        started_at, ended_at, planned_duration_seconds, actual_duration_seconds,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const tx = db.transaction(() => {
      for (const row of events) {
        insertEvent.run(
          Number(row.id),
          String(row.guild_id),
          String(row.name),
          row.description != null ? String(row.description) : null,
          String(row.organizer_id),
          String(row.channel_id),
          row.embed_message_id != null ? String(row.embed_message_id) : null,
          toIso(row.started_at),
          toIso(row.ended_at),
          row.planned_duration_seconds != null ? Number(row.planned_duration_seconds) : null,
          row.actual_duration_seconds != null ? Number(row.actual_duration_seconds) : null,
          String(row.status),
          toIso(row.created_at),
          toIso(row.updated_at),
        );
      }
    });
    tx();

    const participants = (
      await pool.query(
        `SELECT id, event_id, user_id, clicked_button_at, first_message_at, last_message_at,
                message_count, created_at
         FROM event_participants ORDER BY id`,
      )
    ).rows as Record<string, unknown>[];

    const insertParticipant = db.prepare(
      `INSERT INTO event_participants (
        id, event_id, user_id, clicked_button_at, first_message_at, last_message_at,
        message_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const txP = db.transaction(() => {
      for (const row of participants) {
        insertParticipant.run(
          Number(row.id),
          Number(row.event_id),
          String(row.user_id),
          toIso(row.clicked_button_at),
          toIso(row.first_message_at),
          toIso(row.last_message_at),
          Number(row.message_count ?? 0),
          toIso(row.created_at),
        );
      }
    });
    txP();

    const snapshots = (
      await pool.query(
        `SELECT event_id, count_button_only, count_message_only, count_both,
                total_messages, unique_participants, computed_at
         FROM event_snapshots ORDER BY event_id`,
      )
    ).rows as Record<string, unknown>[];

    const insertSnapshot = db.prepare(
      `INSERT INTO event_snapshots (
        event_id, count_button_only, count_message_only, count_both,
        total_messages, unique_participants, computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    const txS = db.transaction(() => {
      for (const row of snapshots) {
        insertSnapshot.run(
          Number(row.event_id),
          Number(row.count_button_only ?? 0),
          Number(row.count_message_only ?? 0),
          Number(row.count_both ?? 0),
          String(row.total_messages ?? 0),
          Number(row.unique_participants ?? 0),
          toIso(row.computed_at),
        );
      }
    });
    txS();

    const aggregates = (
      await pool.query(
        `SELECT id, guild_id, year, month, events_finished, total_participations,
                total_messages, updated_at
         FROM monthly_aggregates ORDER BY id`,
      )
    ).rows as Record<string, unknown>[];

    const insertAgg = db.prepare(
      `INSERT INTO monthly_aggregates (
        id, guild_id, year, month, events_finished, total_participations, total_messages, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const txA = db.transaction(() => {
      for (const row of aggregates) {
        insertAgg.run(
          Number(row.id),
          String(row.guild_id),
          Number(row.year),
          Number(row.month),
          Number(row.events_finished ?? 0),
          Number(row.total_participations ?? 0),
          String(row.total_messages ?? 0),
          toIso(row.updated_at),
        );
      }
    });
    txA();

    const logs = (
      await pool.query(
        `SELECT id, guild_id, actor_id, action, target_type, target_id, payload, created_at
         FROM admin_logs ORDER BY id`,
      )
    ).rows as Record<string, unknown>[];

    const insertLog = db.prepare(
      `INSERT INTO admin_logs (
        id, guild_id, actor_id, action, target_type, target_id, payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const txL = db.transaction(() => {
      for (const row of logs) {
        insertLog.run(
          Number(row.id),
          String(row.guild_id),
          String(row.actor_id),
          String(row.action),
          row.target_type != null ? String(row.target_type) : null,
          row.target_id != null ? String(row.target_id) : null,
          toJsonText(row.payload),
          toIso(row.created_at),
        );
      }
    });
    txL();

    const maxEventId = events.length ? Math.max(...events.map((r) => Number(r.id))) : 0;
    const maxParticipantId = participants.length
      ? Math.max(...participants.map((r) => Number(r.id)))
      : 0;
    const maxAggId = aggregates.length ? Math.max(...aggregates.map((r) => Number(r.id))) : 0;
    const maxLogId = logs.length ? Math.max(...logs.map((r) => Number(r.id))) : 0;

    if (maxEventId > 0) {
      db.prepare(`INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('events', ?)`).run(maxEventId);
    }
    if (maxParticipantId > 0) {
      db.prepare(`INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('event_participants', ?)`).run(
        maxParticipantId,
      );
    }
    if (maxAggId > 0) {
      db.prepare(`INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('monthly_aggregates', ?)`).run(maxAggId);
    }
    if (maxLogId > 0) {
      db.prepare(`INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('admin_logs', ?)`).run(maxLogId);
    }

    console.log(
      `[migrate] Eventos: ${events.length} eventos, ${participants.length} participantes, ` +
        `${snapshots.length} snapshots, ${aggregates.length} agregados, ${logs.length} logs — ${envFile}`,
    );
  } finally {
    await pool.end();
  }
}

function migrateEventsAuto(): void {
  const file = findLegacyEventsEnvFile();
  if (!file) {
    console.log('[migrate] Nenhum .env legado de eventos encontrado (use --events <caminho>).');
    return;
  }
  migrateEventsPostgres(file).catch((e) => {
    console.error('[migrate] Falha ao importar eventos:', e);
    process.exitCode = 1;
  });
}

function findLegacyQuizDataFile(): string | null {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const downloads = path.join(home, 'Downloads');
  try {
    for (const entry of fs.readdirSync(downloads, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.toLowerCase().includes('quiz')) continue;
      const base = path.join(downloads, entry.name);
      for (const rel of ['quiz-data.json', 'data/quiz-data.json']) {
        const file = path.join(base, rel);
        if (fs.existsSync(file)) return file;
      }
    }
  } catch {
    /* Downloads indisponível */
  }
  return null;
}

function migrateQuizAuto(): void {
  const file = findLegacyQuizDataFile();
  if (!file) {
    console.log('[migrate] Nenhum quiz-data.json legado encontrado (use --quiz <caminho>).');
    return;
  }
  migrateQuiz(file);
}

async function migrateAutoLocal(): Promise<void> {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const downloads = path.join(home, 'Downloads');

  const chilizDir = fs
    .readdirSync(downloads, { withFileTypes: true })
    .find((d) => d.isDirectory() && d.name.toLowerCase().startsWith('chiliz bot'));
  const walletDir = fs
    .readdirSync(downloads, { withFileTypes: true })
    .find((d) => d.isDirectory() && d.name.toLowerCase().startsWith('registrodecarteira'));

  if (chilizDir) {
    const dbPath = path.join(downloads, chilizDir.name, 'src', 'database', 'database.sqlite');
    if (fs.existsSync(dbPath)) {
      migratePointsSqlite(dbPath);
      migrateShopSqlite(dbPath);
    } else {
      console.log('[migrate] chiliz bot encontrado mas sem database.sqlite');
    }
  } else {
    console.log('[migrate] Pasta chiliz bot não encontrada em Downloads');
  }

  if (walletDir) {
    const walletsPath = path.join(downloads, walletDir.name, 'wallets.json');
    if (fs.existsSync(walletsPath)) migrateWallets(walletsPath);
    else console.log('[migrate] RegistroDeCarteira sem wallets.json');
  } else {
    console.log('[migrate] Pasta RegistroDeCarteira não encontrada em Downloads');
  }

  migrateQuizAuto();

  const eventsEnv = findLegacyEventsEnvFile();
  if (eventsEnv) {
    await migrateEventsPostgres(eventsEnv);
  } else {
    console.log('[migrate] Pasta legada de eventos não encontrada em Downloads');
  }
}

async function main(): Promise<void> {
  getDb();
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--quiz-auto') {
      migrateQuizAuto();
      continue;
    }
    if (flag === '--events-auto') {
      migrateEventsAuto();
      continue;
    }
    if (flag === '--auto-local') {
      await migrateAutoLocal();
      continue;
    }
    const value = args[i + 1];
    if (!value) continue;
    const resolved = path.resolve(value);
    if (flag === '--wallets') migrateWallets(resolved);
    else if (flag === '--points') migratePointsSqlite(resolved);
    else if (flag === '--points-json') migratePointsJson(resolved);
    else if (flag === '--shop') migrateShopSqlite(resolved);
    else if (flag === '--quiz') migrateQuiz(resolved);
    else if (flag === '--events') await migrateEventsPostgres(resolved);
    i++;
  }
  console.log('[migrate] Concluído.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
