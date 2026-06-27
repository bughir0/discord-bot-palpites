import type { DbQueryable as Pool } from "../../../db/sqlite-pool";
import { EventRepository } from "../database/repositories/event.repository";
import { ParticipantRepository } from "../database/repositories/participant.repository";
import type { EventRow } from "../models/types";

export interface MonthlyReport {
  year: number;
  month: number;
  guildId: string;
  eventsInMonth: EventRow[];
  aggregate: {
    events_finished: number;
    total_participations: number;
    total_messages: string;
  } | null;
}

export class ReportService {
  constructor(private readonly pool: Pool) {}

  async getMonthlyReport(
    guildId: string,
    year: number,
    month: number,
  ): Promise<MonthlyReport> {
    const ev = new EventRepository(this.pool);
    const eventsInMonth = await ev.listFinishedInMonth(guildId, year, month);
    const agg = await this.pool.query(
      `SELECT events_finished, total_participations, total_messages
       FROM monthly_aggregates WHERE guild_id = $1 AND year = $2 AND month = $3`,
      [guildId, year, month],
    );
    const row = agg.rows[0];
    return {
      year,
      month,
      guildId,
      eventsInMonth,
      aggregate: row
        ? {
            events_finished: Number(row.events_finished),
            total_participations: Number(row.total_participations),
            total_messages: String(row.total_messages),
          }
        : null,
    };
  }

  async getRanking(
    guildId: string,
    year: number,
    month: number,
    limit: number,
  ): Promise<{ user_id: string; total_messages: string; events_joined: string }[]> {
    return new ParticipantRepository(this.pool).rankingByGuildMonth(
      guildId,
      year,
      month,
      limit,
    );
  }
}
