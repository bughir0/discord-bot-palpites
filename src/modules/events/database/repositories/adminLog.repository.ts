import type { DbQueryable as Pool, DbQueryable as PoolClient } from "../../../../db/sqlite-pool";

export class AdminLogRepository {
  constructor(private readonly db: Pool | PoolClient) {}

  async insert(entry: {
    guildId: string;
    actorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO admin_logs (guild_id, actor_id, action, target_type, target_id, payload)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        entry.guildId,
        entry.actorId,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.payload ?? null,
      ],
    );
  }
}
