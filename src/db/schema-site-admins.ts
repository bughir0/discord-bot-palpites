import type Database from 'better-sqlite3';

export type SiteAdminRole = 'developer' | 'community_manager' | 'moderator';

export function initSiteAdminSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_admin_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('developer', 'community_manager', 'moderator')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deactivated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS site_admin_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES site_admin_users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      ip TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_site_admin_sessions_user ON site_admin_sessions(user_id);

    CREATE TABLE IF NOT EXISTS site_admin_login_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      username_attempt TEXT NOT NULL,
      success INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_site_admin_login_user ON site_admin_login_events(user_id);
  `);

  try {
    db.exec(`ALTER TABLE site_admin_users ADD COLUMN deactivated_at TEXT`);
  } catch {
    /* coluna já existe */
  }
}
