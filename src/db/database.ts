import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(env.databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(env.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      canal_palpites_id TEXT,
      canal_resultados_id TEXT,
      canal_copa_palpites_id TEXT,
      canal_copa_resultados_id TEXT,
      campeonato_id INTEGER DEFAULT 10,
      pontos_exato INTEGER DEFAULT 3,
      pontos_vencedor INTEGER DEFAULT 1,
      cor_embed TEXT DEFAULT '#5B4B8A',
      notificar_resultados INTEGER DEFAULT 1,
      auto_verificar INTEGER DEFAULT 1,
      auto_abrir_rodada INTEGER DEFAULT 0,
      cargo_palpites_id TEXT
    );

    CREATE TABLE IF NOT EXISTS rodadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      campeonato_id INTEGER NOT NULL,
      numero_rodada INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      status TEXT DEFAULT 'aberta',
      aberta_em TEXT NOT NULL,
      fechada_em TEXT,
      resultados_publicados INTEGER DEFAULT 0,
      modalidade TEXT DEFAULT 'free',
      entrada_chz_wei TEXT,
      UNIQUE(guild_id, campeonato_id, numero_rodada)
    );

    CREATE TABLE IF NOT EXISTS wallet_links (
      discord_user_id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      signed_message TEXT NOT NULL,
      assinatura TEXT NOT NULL,
      vinculado_em TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wallet_links_address ON wallet_links(wallet_address);

    CREATE TABLE IF NOT EXISTS aposta_sessions (
      session_id TEXT PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT,
      rodada_id INTEGER NOT NULL,
      palpites_json TEXT NOT NULL,
      status TEXT DEFAULT 'pendente',
      tx_hash TEXT,
      wallet_address TEXT,
      criado_em TEXT NOT NULL,
      expira_em TEXT NOT NULL,
      confirmado_em TEXT,
      FOREIGN KEY (rodada_id) REFERENCES rodadas(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_aposta_sessions_user ON aposta_sessions(discord_user_id);
    CREATE INDEX IF NOT EXISTS idx_aposta_sessions_rodada ON aposta_sessions(rodada_id);

    CREATE TABLE IF NOT EXISTS vinculacoes_wallet_pendentes (
      token TEXT PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT,
      mensagem TEXT NOT NULL,
      criado_em TEXT NOT NULL,
      expira_em TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS partidas_rodada (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rodada_id INTEGER NOT NULL,
      partida_id INTEGER NOT NULL,
      time_mandante TEXT NOT NULL,
      time_visitante TEXT NOT NULL,
      sigla_mandante TEXT,
      sigla_visitante TEXT,
      escudo_mandante TEXT,
      escudo_visitante TEXT,
      estadio TEXT,
      data_realizacao TEXT,
      hora_realizacao TEXT,
      data_realizacao_iso TEXT,
      status TEXT DEFAULT 'agendado',
      placar_mandante INTEGER,
      placar_visitante INTEGER,
      processada INTEGER DEFAULT 0,
      FOREIGN KEY (rodada_id) REFERENCES rodadas(id) ON DELETE CASCADE,
      UNIQUE(rodada_id, partida_id)
    );

    CREATE TABLE IF NOT EXISTS palpites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rodada_id INTEGER NOT NULL,
      partida_id INTEGER NOT NULL,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT,
      palpite_mandante INTEGER NOT NULL,
      palpite_visitante INTEGER NOT NULL,
      pontos INTEGER DEFAULT 0,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT,
      wallet_address TEXT,
      tx_hash TEXT,
      onchain_confirmed INTEGER DEFAULT 0,
      FOREIGN KEY (rodada_id) REFERENCES rodadas(id) ON DELETE CASCADE,
      UNIQUE(rodada_id, partida_id, discord_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_palpites_rodada ON palpites(rodada_id);
    CREATE INDEX IF NOT EXISTS idx_partidas_rodada ON partidas_rodada(rodada_id);
    CREATE INDEX IF NOT EXISTS idx_rodadas_guild ON rodadas(guild_id, status);
  `);

  ensureColumns(database, 'partidas_rodada', [
    ['sigla_mandante', 'TEXT'],
    ['sigla_visitante', 'TEXT'],
    ['escudo_mandante', 'TEXT'],
    ['escudo_visitante', 'TEXT'],
    ['estadio', 'TEXT'],
    ['data_realizacao', 'TEXT'],
    ['hora_realizacao', 'TEXT'],
  ]);
  ensureColumns(database, 'guild_config', [
    ['auto_abrir_rodada', 'INTEGER DEFAULT 0'],
    ['cargo_palpites_id', 'TEXT'],
    ['canal_copa_palpites_id', 'TEXT'],
    ['canal_copa_resultados_id', 'TEXT'],
  ]);
  ensureColumns(database, 'rodadas', [
    ['resultados_publicados', 'INTEGER DEFAULT 0'],
    ['modalidade', `TEXT DEFAULT 'free'`],
    ['entrada_chz_wei', 'TEXT'],
  ]);
  ensureColumns(database, 'palpites', [
    ['wallet_address', 'TEXT'],
    ['tx_hash', 'TEXT'],
    ['onchain_confirmed', 'INTEGER DEFAULT 0'],
  ]);
}

/** Adiciona colunas que faltam em uma tabela existente (migration leve). */
function ensureColumns(
  database: Database.Database,
  table: string,
  columns: Array<[name: string, definition: string]>,
): void {
  const existing = new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );

  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
