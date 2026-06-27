import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../db/database';
import { log } from '../utils/logger';
import type { SiteAdminRole } from '../db/schema-site-admins';

const SESSION_DAYS = 7;
const SCRYPT_KEYLEN = 64;

export type SiteAdminUser = {
  id: string;
  username: string;
  role: SiteAdminRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
};

export type LoginResult =
  | { ok: true; user: SiteAdminUser; session: SiteAdminSession }
  | { ok: false; error: 'credenciais_invalidas' | 'conta_desativada' };

export type VerifyResult =
  | { ok: true; user: SiteAdminUser }
  | { ok: false; error: 'sessao_invalida' | 'conta_desativada' };

export type SiteAdminSession = {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revoked: boolean;
  ip: string | null;
  userAgent: string | null;
};

export type SiteAdminLoginEvent = {
  id: number;
  userId: string | null;
  usernameAttempt: string;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type SiteAdminUserRow = SiteAdminUser & {
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastLoginUserAgent: string | null;
  activeSessions: number;
  purgeAt: string | null;
};

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

const DEACTIVATED_RETENTION_DAYS = 30;

function mapUser(row: Record<string, unknown>): SiteAdminUser {
  return {
    id: String(row.id),
    username: String(row.username),
    role: row.role as SiteAdminRole,
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deactivatedAt: row.deactivated_at ? String(row.deactivated_at) : null,
  };
}

function purgeAtFromDeactivatedAt(deactivatedAt: string | null): string | null {
  if (!deactivatedAt) return null;
  const d = new Date(deactivatedAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + DEACTIVATED_RETENTION_DAYS);
  return d.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function sessionExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d.toISOString();
}

export class SiteAdminStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Cria ou atualiza o usuário bootstrap (ADMIN_USERNAME) a partir do .env. */
  ensureEnvBootstrapAdmin(username: string | undefined, password: string | undefined): void {
    if (!username?.trim() || !password) return;

    const trimmed = username.trim();
    const ts = nowIso();
    const existing = this.findByUsername(trimmed);

    if (!existing) {
      const count = this.db
        .prepare('SELECT COUNT(*) AS c FROM site_admin_users')
        .get() as { c: number };
      if (count.c > 0) return;

      this.db
        .prepare(
          `INSERT INTO site_admin_users (id, username, password_hash, role, active, created_at, updated_at)
           VALUES (?, ?, ?, 'developer', 1, ?, ?)`,
        )
        .run(randomUUID(), trimmed, hashPassword(password), ts, ts);
      return;
    }

    if (!verifyPassword(password, existing.passwordHash)) {
      this.db
        .prepare(
          `UPDATE site_admin_users SET password_hash = ?, updated_at = ? WHERE id = ?`,
        )
        .run(hashPassword(password), ts, existing.id);
    }
  }

  findByUsername(username: string): (SiteAdminUser & { passwordHash: string }) | null {
    const row = this.findUsernameRow(username);
    if (!row || !row.active) return null;
    return row;
  }

  private findUsernameRow(
    username: string,
  ): (SiteAdminUser & { passwordHash: string }) | null {
    const row = this.db
      .prepare(
        `SELECT id, username, password_hash, role, active, created_at, updated_at, deactivated_at
         FROM site_admin_users WHERE username = ? COLLATE NOCASE LIMIT 1`,
      )
      .get(username.trim()) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...mapUser(row), passwordHash: String(row.password_hash) };
  }

  findById(id: string): SiteAdminUser | null {
    const row = this.db
      .prepare(
        `SELECT id, username, role, active, created_at, updated_at, deactivated_at
         FROM site_admin_users WHERE id = ? LIMIT 1`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return mapUser(row);
  }

  findByIdWithPassword(id: string): (SiteAdminUser & { passwordHash: string }) | null {
    const row = this.db
      .prepare(
        `SELECT id, username, password_hash, role, active, created_at, updated_at, deactivated_at
         FROM site_admin_users WHERE id = ? LIMIT 1`,
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { ...mapUser(row), passwordHash: String(row.password_hash) };
  }

  recordLoginAttempt(
    username: string,
    success: boolean,
    userId: string | null,
    ip: string | null,
    userAgent: string | null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO site_admin_login_events (user_id, username_attempt, success, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, username, success ? 1 : 0, ip, userAgent, nowIso());
  }

  createSession(
    userId: string,
    ip: string | null,
    userAgent: string | null,
  ): SiteAdminSession {
    const id = randomUUID();
    const ts = nowIso();
    const expiresAt = sessionExpiry();
    this.db
      .prepare(
        `INSERT INTO site_admin_sessions (id, user_id, created_at, last_seen_at, expires_at, revoked, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, userId, ts, ts, expiresAt, ip, userAgent);

    return {
      id,
      userId,
      createdAt: ts,
      lastSeenAt: ts,
      expiresAt,
      revoked: false,
      ip,
      userAgent,
    };
  }

  getSession(sessionId: string): SiteAdminSession | null {
    const row = this.db
      .prepare(
        `SELECT id, user_id, created_at, last_seen_at, expires_at, revoked, ip, user_agent
         FROM site_admin_sessions WHERE id = ? LIMIT 1`,
      )
      .get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (row.revoked) return null;
    if (new Date(String(row.expires_at)).getTime() < Date.now()) return null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      createdAt: String(row.created_at),
      lastSeenAt: String(row.last_seen_at),
      expiresAt: String(row.expires_at),
      revoked: false,
      ip: row.ip ? String(row.ip) : null,
      userAgent: row.user_agent ? String(row.user_agent) : null,
    };
  }

  touchSession(sessionId: string): void {
    this.db
      .prepare(`UPDATE site_admin_sessions SET last_seen_at = ? WHERE id = ? AND revoked = 0`)
      .run(nowIso(), sessionId);
  }

  revokeSession(sessionId: string): void {
    this.db
      .prepare(`UPDATE site_admin_sessions SET revoked = 1 WHERE id = ?`)
      .run(sessionId);
  }

  revokeAllSessions(userId: string): number {
    const r = this.db
      .prepare(`UPDATE site_admin_sessions SET revoked = 1 WHERE user_id = ? AND revoked = 0`)
      .run(userId);
    return r.changes;
  }

  listUsers(): SiteAdminUserRow[] {
    const rows = this.db
      .prepare(
        `SELECT u.id, u.username, u.role, u.active, u.created_at, u.updated_at, u.deactivated_at,
                (SELECT created_at FROM site_admin_login_events e
                 WHERE e.user_id = u.id AND e.success = 1
                 ORDER BY e.id DESC LIMIT 1) AS last_login_at,
                (SELECT ip FROM site_admin_login_events e
                 WHERE e.user_id = u.id AND e.success = 1
                 ORDER BY e.id DESC LIMIT 1) AS last_login_ip,
                (SELECT user_agent FROM site_admin_login_events e
                 WHERE e.user_id = u.id AND e.success = 1
                 ORDER BY e.id DESC LIMIT 1) AS last_login_user_agent,
                (SELECT COUNT(*) FROM site_admin_sessions s
                 WHERE s.user_id = u.id AND s.revoked = 0 AND s.expires_at > datetime('now')) AS active_sessions
         FROM site_admin_users u
         ORDER BY u.username COLLATE NOCASE`,
      )
      .all() as Record<string, unknown>[];

    return rows.map((row) => {
      const user = mapUser(row);
      return {
        ...user,
        lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
        lastLoginIp: row.last_login_ip ? String(row.last_login_ip) : null,
        lastLoginUserAgent: row.last_login_user_agent ? String(row.last_login_user_agent) : null,
        activeSessions: Number(row.active_sessions ?? 0),
        purgeAt: purgeAtFromDeactivatedAt(user.deactivatedAt),
      };
    });
  }

  listLoginEvents(userId: string, limit = 50): SiteAdminLoginEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, username_attempt, success, ip, user_agent, created_at
         FROM site_admin_login_events
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(userId, limit) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: Number(row.id),
      userId: row.user_id ? String(row.user_id) : null,
      usernameAttempt: String(row.username_attempt),
      success: Boolean(row.success),
      ip: row.ip ? String(row.ip) : null,
      userAgent: row.user_agent ? String(row.user_agent) : null,
      createdAt: String(row.created_at),
    }));
  }

  listSessions(userId: string): SiteAdminSession[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, created_at, last_seen_at, expires_at, revoked, ip, user_agent
         FROM site_admin_sessions WHERE user_id = ?
         ORDER BY created_at DESC LIMIT 30`,
      )
      .all(userId) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      createdAt: String(row.created_at),
      lastSeenAt: String(row.last_seen_at),
      expiresAt: String(row.expires_at),
      revoked: Boolean(row.revoked),
      ip: row.ip ? String(row.ip) : null,
      userAgent: row.user_agent ? String(row.user_agent) : null,
    }));
  }

  createUser(username: string, password: string, role: SiteAdminRole): SiteAdminUser {
    const ts = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO site_admin_users (id, username, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(id, username.trim(), hashPassword(password), role, ts, ts);
    return this.findById(id)!;
  }

  deleteUser(userId: string): boolean {
    const r = this.db.prepare(`DELETE FROM site_admin_users WHERE id = ?`).run(userId);
    return r.changes > 0;
  }

  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): 'ok' | 'senha_atual_invalida' | 'senha_curta' | 'nao_encontrado' | 'conta_desativada' {
    if (newPassword.length < 8) return 'senha_curta';
    const user = this.findByIdWithPassword(userId);
    if (!user) return 'nao_encontrado';
    if (!user.active) return 'conta_desativada';
    if (!verifyPassword(currentPassword, user.passwordHash)) return 'senha_atual_invalida';
    const ts = nowIso();
    this.db
      .prepare(`UPDATE site_admin_users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .run(hashPassword(newPassword), ts, userId);
    return 'ok';
  }

  adminSetPassword(
    userId: string,
    newPassword: string,
  ): 'ok' | 'senha_curta' | 'nao_encontrado' {
    if (newPassword.length < 8) return 'senha_curta';
    const user = this.findById(userId);
    if (!user) return 'nao_encontrado';
    const ts = nowIso();
    this.db
      .prepare(`UPDATE site_admin_users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .run(hashPassword(newPassword), ts, userId);
    return 'ok';
  }

  setUserActive(
    userId: string,
    active: boolean,
    actorId?: string,
  ): 'ok' | 'nao_encontrado' | 'nao_pode_desativar_a_si' {
    if (!active && actorId && actorId === userId) return 'nao_pode_desativar_a_si';
    const user = this.findById(userId);
    if (!user) return 'nao_encontrado';
    const ts = nowIso();
    if (active) {
      this.db
        .prepare(
          `UPDATE site_admin_users SET active = 1, deactivated_at = NULL, updated_at = ? WHERE id = ?`,
        )
        .run(ts, userId);
    } else {
      this.db
        .prepare(
          `UPDATE site_admin_users SET active = 0, deactivated_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(ts, ts, userId);
      this.revokeAllSessions(userId);
    }
    return 'ok';
  }

  purgeDeactivatedUsers(retentionDays = DEACTIVATED_RETENTION_DAYS): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const r = this.db
      .prepare(
        `DELETE FROM site_admin_users
         WHERE active = 0 AND deactivated_at IS NOT NULL AND deactivated_at < ?`,
      )
      .run(cutoff.toISOString());
    return r.changes;
  }

  login(
    username: string,
    password: string,
    ip: string | null,
    userAgent: string | null,
  ): LoginResult {
    const found = this.findUsernameRow(username);
    if (!found) {
      this.recordLoginAttempt(username, false, null, ip, userAgent);
      return { ok: false, error: 'credenciais_invalidas' };
    }
    if (!found.active) {
      this.recordLoginAttempt(username, false, found.id, ip, userAgent);
      return { ok: false, error: 'conta_desativada' };
    }
    if (!verifyPassword(password, found.passwordHash)) {
      this.recordLoginAttempt(username, false, found.id, ip, userAgent);
      return { ok: false, error: 'credenciais_invalidas' };
    }
    const { passwordHash: _, ...user } = found;
    const session = this.createSession(user.id, ip, userAgent);
    this.recordLoginAttempt(username, true, user.id, ip, userAgent);
    return { user, session, ok: true };
  }

  assertSession(sessionId: string, userId: string): VerifyResult {
    const session = this.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return { ok: false, error: 'sessao_invalida' };
    }
    const user = this.findById(userId);
    if (!user) {
      this.revokeSession(sessionId);
      return { ok: false, error: 'sessao_invalida' };
    }
    if (!user.active) {
      this.revokeSession(sessionId);
      return { ok: false, error: 'conta_desativada' };
    }
    this.touchSession(sessionId);
    return { ok: true, user };
  }
}

let storeSingleton: SiteAdminStore | null = null;

export function getSiteAdminStore(): SiteAdminStore {
  if (!storeSingleton) {
    const db = getDb();
    storeSingleton = new SiteAdminStore(db);
    storeSingleton.ensureEnvBootstrapAdmin(
      process.env.ADMIN_USERNAME,
      process.env.ADMIN_PASSWORD,
    );
    const purged = storeSingleton.purgeDeactivatedUsers();
    if (purged > 0) {
      log.info(`[site-admin] ${purged} conta(s) desativada(s) removida(s) após 30 dias.`);
    }
  }
  return storeSingleton;
}

export const SITE_ADMIN_ROLE_LABELS: Record<SiteAdminRole, string> = {
  developer: 'Developer',
  community_manager: 'Community Manager',
  moderator: 'Moderator',
};
