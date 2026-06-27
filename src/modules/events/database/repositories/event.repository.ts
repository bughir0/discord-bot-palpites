import type { DbQueryable as Pool, DbQueryable as PoolClient } from "../../../../db/sqlite-pool";
import type { EventRow, EventSnapshotRow, EventStatus } from "../../models/types";

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

/** Chave `YYYY-MM` para filtros com strftime (aceita ISO, SQLite e legado PG). */
function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function mapEvent(r: Record<string, unknown>): EventRow {
  return {
    id: String(r.id),
    guild_id: String(r.guild_id),
    name: String(r.name),
    description: r.description != null ? String(r.description) : null,
    organizer_id: String(r.organizer_id),
    channel_id: String(r.channel_id),
    embed_message_id: r.embed_message_id != null ? String(r.embed_message_id) : null,
    started_at: toDate(r.started_at),
    ended_at: r.ended_at != null ? toDate(r.ended_at) : null,
    planned_duration_seconds:
      r.planned_duration_seconds != null ? Number(r.planned_duration_seconds) : null,
    actual_duration_seconds:
      r.actual_duration_seconds != null ? Number(r.actual_duration_seconds) : null,
    status: r.status as EventStatus,
    created_at: toDate(r.created_at),
    updated_at: toDate(r.updated_at),
  };
}

export class EventRepository {
  constructor(private readonly db: Pool | PoolClient) {}

  async create(input: {
    guildId: string;
    name: string;
    description: string | null;
    organizerId: string;
    channelId: string;
    startedAt: Date;
    plannedDurationSeconds: number | null;
  }): Promise<EventRow> {
    const res = await this.db.query(
      `INSERT INTO events (
        guild_id, name, description, organizer_id, channel_id, started_at,
        planned_duration_seconds, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
      RETURNING *`,
      [
        input.guildId,
        input.name,
        input.description,
        input.organizerId,
        input.channelId,
        input.startedAt,
        input.plannedDurationSeconds,
      ],
    );
    return mapEvent(res.rows[0]);
  }

  async setEmbedMessageId(eventId: string, messageId: string): Promise<void> {
    await this.db.query(
      `UPDATE events SET embed_message_id = $2, updated_at = NOW() WHERE id = $1`,
      [eventId, messageId],
    );
  }

  async findActiveByChannel(channelId: string): Promise<EventRow | null> {
    const res = await this.db.query(
      `SELECT * FROM events WHERE channel_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`,
      [channelId],
    );
    return res.rows[0] ? mapEvent(res.rows[0]) : null;
  }

  /** Evento ativo por servidor + canal (contagem de mensagens só no canal do evento). */
  async findActiveByGuildAndChannel(guildId: string, channelId: string): Promise<EventRow | null> {
    const res = await this.db.query(
      `SELECT * FROM events
       WHERE guild_id = $1 AND channel_id = $2 AND status = 'active'
       ORDER BY id DESC
       LIMIT 1`,
      [guildId, channelId],
    );
    return res.rows[0] ? mapEvent(res.rows[0]) : null;
  }

  /** Todos os eventos ativos (warmup do cache após reinício). */
  async listAllActive(): Promise<EventRow[]> {
    const res = await this.db.query(
      `SELECT * FROM events WHERE status = 'active' ORDER BY started_at DESC`,
    );
    return res.rows.map(mapEvent);
  }

  /** Todos os eventos ativos do servidor (para autocomplete em /evento finalizar). */
  async listActiveByGuild(guildId: string): Promise<EventRow[]> {
    const res = await this.db.query(
      `SELECT * FROM events WHERE guild_id = $1 AND status = 'active' ORDER BY started_at DESC`,
      [guildId],
    );
    return res.rows.map(mapEvent);
  }

  async findById(id: string): Promise<EventRow | null> {
    const res = await this.db.query(`SELECT * FROM events WHERE id = $1`, [id]);
    return res.rows[0] ? mapEvent(res.rows[0]) : null;
  }

  async findByIdAndGuild(id: string, guildId: string): Promise<EventRow | null> {
    const res = await this.db.query(
      `SELECT * FROM events WHERE id = $1 AND guild_id = $2`,
      [id, guildId],
    );
    return res.rows[0] ? mapEvent(res.rows[0]) : null;
  }

  /** Eventos finalizados cujo término cai no mês informado. */
  async listFinishedInMonth(
    guildId: string,
    year: number,
    month: number,
  ): Promise<EventRow[]> {
    const key = monthKey(year, month);
    const res = await this.db.query(
      `SELECT * FROM events
       WHERE guild_id = $1 AND status = 'ended'
         AND strftime('%Y-%m', ended_at) = $2
       ORDER BY ended_at DESC`,
      [guildId, key],
    );
    return res.rows.map(mapEvent);
  }

  /** Eventos iniciados no mês (qualquer status). */
  async listStartedInMonth(
    guildId: string,
    year: number,
    month: number,
  ): Promise<EventRow[]> {
    const key = monthKey(year, month);
    const res = await this.db.query(
      `SELECT * FROM events
       WHERE guild_id = $1 AND strftime('%Y-%m', started_at) = $2
       ORDER BY started_at DESC`,
      [guildId, key],
    );
    return res.rows.map(mapEvent);
  }

  /**
   * Eventos do mês para listagem staff: início OU encerramento no período.
   * Cobre eventos legados em que ended_at está correto mas started_at veio em formato diferente.
   */
  async listInMonth(guildId: string, year: number, month: number): Promise<EventRow[]> {
    const key = monthKey(year, month);
    const res = await this.db.query(
      `SELECT * FROM events
       WHERE guild_id = $1
         AND (
           strftime('%Y-%m', started_at) = $2
           OR (ended_at IS NOT NULL AND strftime('%Y-%m', ended_at) = $2)
         )
       ORDER BY COALESCE(ended_at, started_at) DESC`,
      [guildId, key],
    );
    return res.rows.map(mapEvent);
  }

  async endEvent(
    id: string,
    endedAt: Date,
    actualDurationSeconds: number,
  ): Promise<EventRow> {
    const res = await this.db.query(
      `UPDATE events SET
        status = 'ended',
        ended_at = $2,
        actual_duration_seconds = $3,
        updated_at = NOW()
      WHERE id = $1 AND status = 'active'
      RETURNING *`,
      [id, endedAt, actualDurationSeconds],
    );
    if (!res.rows[0]) throw new Error("Evento não encontrado ou já finalizado.");
    return mapEvent(res.rows[0]);
  }

  async insertSnapshot(row: {
    eventId: string;
    countButtonOnly: number;
    countMessageOnly: number;
    countBoth: number;
    totalMessages: bigint;
    uniqueParticipants: number;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO event_snapshots (
        event_id, count_button_only, count_message_only, count_both,
        total_messages, unique_participants, computed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (event_id) DO UPDATE SET
        count_button_only = EXCLUDED.count_button_only,
        count_message_only = EXCLUDED.count_message_only,
        count_both = EXCLUDED.count_both,
        total_messages = EXCLUDED.total_messages,
        unique_participants = EXCLUDED.unique_participants,
        computed_at = NOW()`,
      [
        row.eventId,
        row.countButtonOnly,
        row.countMessageOnly,
        row.countBoth,
        row.totalMessages.toString(),
        row.uniqueParticipants,
      ],
    );
  }

  async getSnapshot(eventId: string): Promise<EventSnapshotRow | null> {
    const res = await this.db.query(`SELECT * FROM event_snapshots WHERE event_id = $1`, [
      eventId,
    ]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      event_id: String(r.event_id),
      count_button_only: Number(r.count_button_only),
      count_message_only: Number(r.count_message_only),
      count_both: Number(r.count_both),
      total_messages: String(r.total_messages),
      unique_participants: Number(r.unique_participants),
      computed_at: toDate(r.computed_at),
    };
  }

  /** Incrementa agregados mensais após finalizar um evento (guild + mês do ended_at). */
  async bumpMonthlyAggregate(
    guildId: string,
    year: number,
    month: number,
    participationsDelta: number,
    messagesDelta: bigint,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO monthly_aggregates (
        guild_id, year, month, events_finished, total_participations, total_messages, updated_at
      ) VALUES ($1,$2,$3,1,$4,$5,NOW())
      ON CONFLICT (guild_id, year, month) DO UPDATE SET
        events_finished = monthly_aggregates.events_finished + 1,
        total_participations = monthly_aggregates.total_participations + $4,
        total_messages = monthly_aggregates.total_messages + $5,
        updated_at = NOW()`,
      [guildId, year, month, participationsDelta, messagesDelta.toString()],
    );
  }
}
