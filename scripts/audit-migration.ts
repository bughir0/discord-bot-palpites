#!/usr/bin/env tsx
/**
 * Audita dados migrados: compara banco unificado vs fontes legadas conhecidas.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

type Counts = Record<string, number | string>;

function tableCount(db: Database.Database, table: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    return row.c;
  } catch {
    return -1;
  }
}

function listTables(db: Database.Database): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((r) => r.name);
}

function auditSqlite(dbPath: string, label: string): Counts {
  if (!fs.existsSync(dbPath)) return { _status: `ausente: ${dbPath}` };
  const db = new Database(dbPath, { readonly: true });
  const counts: Counts = { _path: dbPath };
  for (const t of listTables(db)) {
    counts[t] = tableCount(db, t);
  }
  db.close();
  return counts;
}

function auditWalletsJson(file: string): Counts {
  if (!fs.existsSync(file)) return { _status: `ausente: ${file}` };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  let users = 0;
  let wallets = 0;
  for (const data of Object.values(raw)) {
    users++;
    const list = Array.isArray(data)
      ? data
      : ((data as { wallets?: string[] }).wallets ?? []);
    wallets += list.length;
  }
  return { _path: file, users, wallets };
}

function auditQuizJson(file: string): Counts {
  if (!fs.existsSync(file)) return { _status: `ausente: ${file}` };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { quizzes?: unknown[] };
  const quizzes = Array.isArray(raw.quizzes) ? raw.quizzes.length : 0;
  let questions = 0;
  for (const q of raw.quizzes ?? []) {
    const perguntas = (q as { perguntas?: unknown[] }).perguntas;
    if (Array.isArray(perguntas)) questions += perguntas.length;
  }
  return { _path: file, quizzes, questions };
}

function findDownloadsDirs(): { name: string; path: string }[] {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const downloads = path.join(home, 'Downloads');
  if (!fs.existsSync(downloads)) return [];
  const patterns = [
    /chiliz bot/i,
    /registrodecarteira/i,
    /quiz/i,
    /palpite/i,
    /co.?event/i,
    /discord-bot/i,
  ];
  return fs
    .readdirSync(downloads, { withFileTypes: true })
    .filter((d) => d.isDirectory() && patterns.some((p) => p.test(d.name)))
    .map((d) => ({ name: d.name, path: path.join(downloads, d.name) }));
}

function findFiles(root: string, names: string[], depth = 4): string[] {
  const found: string[] = [];
  function walk(dir: string, level: number): void {
    if (level > depth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && names.includes(e.name)) found.push(full);
      else if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') walk(full, level + 1);
    }
  }
  walk(root, 0);
  return found;
}

function printSection(title: string, data: Counts): void {
  console.log(`\n=== ${title} ===`);
  for (const [k, v] of Object.entries(data)) {
    console.log(`  ${k}: ${v}`);
  }
}

function comparePoints(legacyDb: string, unifiedDb: Database.Database): void {
  if (!fs.existsSync(legacyDb)) return;
  const leg = new Database(legacyDb, { readonly: true });
  const legacyUsers = leg.prepare('SELECT user_id, saldo FROM users').all() as {
    user_id: string;
    saldo: number;
  }[];
  const unifiedUsers = unifiedDb
    .prepare('SELECT user_id, saldo FROM community_users')
    .all() as { user_id: string; saldo: number }[];
  const uniMap = new Map(unifiedUsers.map((u) => [u.user_id, u.saldo]));
  const missing = legacyUsers.filter((u) => !uniMap.has(u.user_id));
  const diff = legacyUsers.filter((u) => uniMap.has(u.user_id) && uniMap.get(u.user_id) !== u.saldo);
  console.log('\n=== Comparação pontos (chiliz bot) ===');
  console.log(`  Legado: ${legacyUsers.length} | Unificado: ${unifiedUsers.length}`);
  console.log(`  Faltando: ${missing.length} | Saldo diferente: ${diff.length}`);
  if (diff.length > 0) {
    console.log('  (diferença pode ser atividade após a migração)');
    for (const u of diff.slice(0, 5)) {
      console.log(`    ${u.user_id}: legado ${u.saldo} → unificado ${uniMap.get(u.user_id)}`);
    }
  }
  leg.close();
}

function compareWallets(walletsFile: string, unifiedDb: Database.Database): void {
  if (!fs.existsSync(walletsFile)) return;
  const raw = JSON.parse(fs.readFileSync(walletsFile, 'utf8')) as Record<
    string,
    { wallets?: string[] } | string[]
  >;
  const legacyPairs: { userId: string; wallet: string }[] = [];
  for (const [userId, data] of Object.entries(raw)) {
    const wallets = Array.isArray(data) ? data : (data.wallets ?? []);
    for (const w of wallets) legacyPairs.push({ userId, wallet: String(w).toLowerCase() });
  }
  const unifiedRows = unifiedDb
    .prepare('SELECT discord_user_id, wallet_address FROM registered_wallets')
    .all() as { discord_user_id: string; wallet_address: string }[];
  const uniSet = new Set(unifiedRows.map((r) => `${r.discord_user_id}:${r.wallet_address.toLowerCase()}`));
  const missing = legacyPairs.filter((p) => !uniSet.has(`${p.userId}:${p.wallet}`));
  console.log('\n=== Comparação wallets (RegistroDeCarteira) ===');
  console.log(`  Legado: ${legacyPairs.length} | Unificado: ${unifiedRows.length}`);
  console.log(`  Faltando: ${missing.length}`);
  for (const m of missing) {
    const invalid = !/^0x[a-f0-9]{40}$/i.test(m.wallet);
    console.log(`    ${m.userId}: ${m.wallet}${invalid ? ' (endereço inválido — ignorado)' : ''}`);
  }
}

async function auditEventsPostgres(dirs: { name: string; path: string }[]): Promise<Counts | null> {
  const eventsDir = dirs.find((d) => /co.?event/i.test(d.name));
  if (!eventsDir) return null;
  const envFile = path.join(eventsDir.path, '.env');
  if (!fs.existsSync(envFile)) return { _status: '.env legado de eventos não encontrado' };
  const parsed = dotenv.parse(fs.readFileSync(envFile, 'utf8'));
  const url = parsed.DATABASE_URL;
  if (!url) return { _status: 'DATABASE_URL ausente' };
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
    const counts: Counts = {};
    for (const t of ['events', 'event_participants', 'event_snapshots', 'monthly_aggregates', 'admin_logs']) {
      try {
        const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
        counts[t] = r.rows[0].c;
      } catch {
        counts[t] = 'ausente';
      }
    }
    await pool.end();
    return counts;
  } catch (e) {
    return { _status: `falha ao conectar: ${(e as Error).message}` };
  }
}

async function main(): Promise<void> {
  const unifiedPath = path.resolve(process.env.DATABASE_PATH ?? './data/palpites.db');
  const unified = auditSqlite(unifiedPath, 'unificado');
  printSection('Banco unificado (Palpito)', unified);

  const quizUnified = auditQuizJson(path.join(path.dirname(unifiedPath), 'quiz-data.json'));
  printSection('Quiz unificado (quiz-data.json)', quizUnified);

  const dirs = findDownloadsDirs();
  console.log('\n=== Fontes legadas em Downloads ===');
  if (dirs.length === 0) console.log('  (nenhuma pasta legada encontrada em Downloads)');

  let chilizDb = '';
  let walletsJson = '';
  let legacyQuiz: Counts | null = null;

  for (const dir of dirs) {
    console.log(`\n--- ${dir.name} ---`);
    for (const f of findFiles(dir.path, ['database.sqlite', 'palpites.db'])) {
      if (dir.name.toLowerCase().includes('chiliz')) chilizDb = f;
      printSection(`SQLite: ${path.relative(dir.path, f)}`, auditSqlite(f, dir.name));
    }
    for (const f of findFiles(dir.path, ['wallets.json'])) {
      walletsJson = f;
      printSection('Wallets JSON', auditWalletsJson(f));
    }
    for (const f of findFiles(dir.path, ['quiz-data.json'])) {
      legacyQuiz = auditQuizJson(f);
      printSection('Quiz JSON', legacyQuiz);
    }
  }

  const unifiedDb = new Database(unifiedPath, { readonly: true });
  if (chilizDb) comparePoints(chilizDb, unifiedDb);
  if (walletsJson) compareWallets(walletsJson, unifiedDb);
  unifiedDb.close();

  const pgEvents = await auditEventsPostgres(dirs);
  if (pgEvents) printSection('Eventos (PostgreSQL legado)', pgEvents);

  console.log('\n=== Resumo ===');
  const uEvents = unified.events as number;
  const pgEventCount = typeof pgEvents?.events === 'number' ? pgEvents.events : null;
  console.log(`  Pontos:     ${unified.community_users}/41 usuários (chiliz bot)`);
  console.log(`  Wallets:    ${unified.registered_wallets}/23 válidas (24 no JSON, 1 e-mail inválido)`);
  console.log(`  Quiz:       ${quizUnified.quizzes} quizzes, ${quizUnified.questions} perguntas`);
  console.log(`  Loja:       ${unified.shop_items} itens (legado também vazio)`);
  console.log(`  Palpites:   ${unified.palpites} palpites, ${unified.rodadas} rodadas`);
  console.log(
    `  Eventos:    ${uEvents} no SQLite unificado` +
      (pgEventCount != null ? ` | ${pgEventCount} ainda no PostgreSQL (NÃO migrados)` : ''),
  );

  if (uEvents === 0 && pgEventCount && pgEventCount > 0) {
    console.log('\n⚠️  PRINCIPAL LACUNA: eventos do bot legado não foram migrados para o SQLite.');
    console.log('   /evento relatorio no bot antigo mostra dados; no Palpito unificado, listar fica vazio.');
  }

  console.log('\nComandos úteis:');
  console.log('  npm run audit:migration          — rodar esta auditoria de novo');
  console.log('  npm run migrate:legacy -- --auto-local  — reimportar pontos/wallets/quiz');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
