import type Database from 'better-sqlite3';

export interface DbQueryable {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  connect(): Promise<DbQueryable>;
  release(): void;
  end?(): Promise<void>;
}

/** SQLite só aceita string, number, bigint, buffer e null nos binds. */
function bindParams(params: unknown[]): unknown[] {
  return params.map((value) => (value instanceof Date ? value.toISOString() : value));
}

/**
 * Adaptador SQLite com API parecida com pg.Pool.
 * Permite reutilizar repositórios de eventos com mínimas alterações.
 */
export class SqlitePool implements DbQueryable {
  constructor(private readonly db: Database.Database) {}

  async query(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    const { sql, params: sqliteParams } = pgToSqlite(text, params);
    const upper = sql.trim().toUpperCase();
    const hasReturning = upper.includes(' RETURNING ');
    const isRead = upper.startsWith('SELECT') || upper.startsWith('WITH') || hasReturning;

    const bound = bindParams(sqliteParams);

    if (isRead) {
      const rows = this.db.prepare(sql).all(...bound) as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    }

    const result = this.db.prepare(sql).run(...bound);
    return { rows: [], rowCount: result.changes };
  }

  async connect(): Promise<DbQueryable> {
    return this;
  }

  release(): void {
    /* noop — sem pool de conexões no SQLite */
  }

  async end(): Promise<void> {
    /* SQLite compartilhado com o bot — não fecha aqui */
  }
}

/**
 * Converte SQL estilo pg ($1, $2…) para SQLite (?).
 * Placeholders repetidos ($2 duas vezes) viram ? distintos com o mesmo valor — como no pg.
 */
function pgToSqlite(
  sql: string,
  params: unknown[],
): { sql: string; params: unknown[] } {
  let out = sql
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    .replace(/\bTIMESTAMPTZ\b/gi, 'TEXT')
    .replace(/\bJSONB\b/gi, 'TEXT')
    .replace(/\bBIGSERIAL\b/gi, 'INTEGER')
    .replace(/\bSMALLINT\b/gi, 'INTEGER');

  const sqliteParams: unknown[] = [];
  out = out.replace(/\$(\d+)/g, (_, num) => {
    sqliteParams.push(params[Number(num) - 1]);
    return '?';
  });
  return { sql: out, params: sqliteParams };
}
