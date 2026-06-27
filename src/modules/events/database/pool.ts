import { getDb } from '../../../db/database';
import { SqlitePool, type DbQueryable } from '../../../db/sqlite-pool';

let poolInstance: SqlitePool | null = null;

function getPoolInstance(): SqlitePool {
  if (!poolInstance) {
    poolInstance = new SqlitePool(getDb());
  }
  return poolInstance;
}

/** Pool SQLite usado pelos repositórios de eventos (compatível com pg.Pool). */
export const pool: DbQueryable = {
  query: (text: string, params?: unknown[]) => getPoolInstance().query(text, params ?? []),
  connect: () => getPoolInstance().connect(),
  release: () => getPoolInstance().release(),
  end: () => getPoolInstance().end!(),
};

/** Migrações PG substituídas pelo schema unificado em initCommunitySchema. */
export async function runMigrations(): Promise<void> {
  /* noop */
}
