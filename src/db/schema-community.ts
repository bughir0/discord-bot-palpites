import type Database from 'better-sqlite3';

/** Tabelas compartilhadas: pontos, loja, wallets, eventos, quiz */
export function initCommunitySchema(database: Database.Database): void {
  database.exec(`
    -- ========== PONTOS (chiliz bot) ==========
    CREATE TABLE IF NOT EXISTS community_users (
      user_id TEXT PRIMARY KEY,
      saldo INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shop_settings (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      image_url TEXT,
      color TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      delivery_type TEXT NOT NULL DEFAULT 'none',
      delivery_role_id TEXT,
      delivery_text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_shop_items_guild ON shop_items (guild_id);

    CREATE TABLE IF NOT EXISTS shop_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      total_price INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      purchase_code TEXT,
      staff_id TEXT,
      delivered_at TEXT,
      delivery_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES shop_items(id)
    );
    CREATE INDEX IF NOT EXISTS idx_shop_purchases_guild_user ON shop_purchases (guild_id, user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_purchases_code ON shop_purchases (purchase_code);

    -- ========== WALLETS (RegistroDeCarteira + palpites) ==========
    CREATE TABLE IF NOT EXISTS registered_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT,
      wallet_address TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      signed_message TEXT,
      assinatura TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(discord_user_id, wallet_address)
    );
    CREATE INDEX IF NOT EXISTS idx_registered_wallets_user ON registered_wallets (discord_user_id);
    CREATE INDEX IF NOT EXISTS idx_registered_wallets_address ON registered_wallets (wallet_address);

    -- ========== EVENTOS ==========
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      organizer_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      embed_message_id TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      planned_duration_seconds INTEGER,
      actual_duration_seconds INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_guild_status ON events (guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_events_started ON events (started_at);

    CREATE TABLE IF NOT EXISTS event_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      clicked_button_at TEXT,
      first_message_at TEXT,
      last_message_at TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (event_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants (event_id);

    CREATE TABLE IF NOT EXISTS event_snapshots (
      event_id INTEGER PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
      count_button_only INTEGER NOT NULL DEFAULT 0,
      count_message_only INTEGER NOT NULL DEFAULT 0,
      count_both INTEGER NOT NULL DEFAULT 0,
      total_messages INTEGER NOT NULL DEFAULT 0,
      unique_participants INTEGER NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_aggregates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
      events_finished INTEGER NOT NULL DEFAULT 0,
      total_participations INTEGER NOT NULL DEFAULT 0,
      total_messages INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (guild_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ========== QUIZ ==========
    -- Dados do quiz ficam em quiz-data.json (ver modules/quiz/store.ts)

    CREATE TABLE IF NOT EXISTS points_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      source TEXT NOT NULL,
      reference TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON points_ledger (user_id);
  `);
}
