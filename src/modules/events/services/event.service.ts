import type { DbQueryable as Pool, DbQueryable as PoolClient } from "../../../db/sqlite-pool";
import { EventRepository } from "../database/repositories/event.repository";
import { ParticipantRepository } from "../database/repositories/participant.repository";
import type {
  EventFinishStats,
  EventRow,
  EventSnapshotRow,
  ParticipantRow,
} from "../models/types";
import { buildEventNameWithStartDate } from "../utils/eventDate";
import { buildParticipationBuckets, totalMessages } from "./participation.service";
import { activeEventCache } from "./activeEventCache";

export class EventService {
  constructor(private readonly pool: Pool) {}

  /** Recarrega eventos ativos no cache (boot / reconexão). */
  async warmActiveEventCache(): Promise<number> {
    const rows = await this.events().listAllActive();
    activeEventCache.clear();
    for (const row of rows) activeEventCache.setFromEvent(row);
    return rows.length;
  }

  private events(db: Pool | PoolClient = this.pool): EventRepository {
    return new EventRepository(db);
  }

  private participants(db: Pool | PoolClient = this.pool): ParticipantRepository {
    return new ParticipantRepository(db);
  }

  async createEvent(input: {
    guildId: string;
    name: string;
    description: string | null;
    organizerId: string;
    channelId: string;
    plannedDurationMinutes: number | null;
  }): Promise<EventRow> {
    const existing = await this.events().findActiveByChannel(input.channelId);
    if (existing) {
      throw new Error(
        "Já existe um evento ativo neste canal. Finalize o evento antes de iniciar outro.",
      );
    }
    const planned =
      input.plannedDurationMinutes != null && input.plannedDurationMinutes > 0
        ? input.plannedDurationMinutes * 60
        : null;
    const startedAt = new Date();
    const name = buildEventNameWithStartDate(input.name, startedAt);
    const created = await this.events().create({
      guildId: input.guildId,
      name,
      description: input.description,
      organizerId: input.organizerId,
      channelId: input.channelId,
      startedAt,
      plannedDurationSeconds: planned,
    });
    activeEventCache.setFromEvent(created);
    return created;
  }

  async setEmbedMessage(eventId: string, messageId: string): Promise<void> {
    await this.events().setEmbedMessageId(eventId, messageId);
  }

  async getActiveEventForChannel(channelId: string): Promise<EventRow | null> {
    return this.events().findActiveByChannel(channelId);
  }

  /** Eventos com status `active` neste servidor (autocomplete / finalizar). */
  async listActiveEventsForGuild(guildId: string): Promise<EventRow[]> {
    return this.events().listActiveByGuild(guildId);
  }

  /** Eventos em que o membro tem registro (botão/mensagens), por estado ended/active. */
  async getParticipationCountsForMember(
    guildId: string,
    userId: string,
  ): Promise<{ ended: number; active: number }> {
    return this.participants().participationCountsByMember(guildId, userId);
  }

  async getEvent(guildId: string, eventId: string): Promise<EventRow | null> {
    return this.events().findByIdAndGuild(eventId, guildId);
  }

  /**
   * Finaliza evento, grava snapshot, atualiza agregados mensais (mês do encerramento).
   */
  async finalizeEvent(eventId: string, guildId: string): Promise<EventFinishStats> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const evRepo = this.events(client);
      const partRepo = this.participants(client);

      const row = await evRepo.findByIdAndGuild(eventId, guildId);
      if (!row || row.status !== "active") {
        throw new Error("Evento não encontrado ou já finalizado.");
      }
      const endedAt = new Date();
      const actualSeconds = Math.max(
        0,
        Math.floor((endedAt.getTime() - row.started_at.getTime()) / 1000),
      );
      await evRepo.endEvent(eventId, endedAt, actualSeconds);

      const participants = await partRepo.listByEvent(eventId);
      const buckets = buildParticipationBuckets(participants);
      const totalMsg = totalMessages(participants);
      const unique = participants.length;

      await evRepo.insertSnapshot({
        eventId,
        countButtonOnly: buckets.buttonOnly.length,
        countMessageOnly: buckets.messageOnly.length,
        countBoth: buckets.both.length,
        totalMessages: totalMsg,
        uniqueParticipants: unique,
      });

      const y = endedAt.getUTCFullYear();
      const m = endedAt.getUTCMonth() + 1;
      await evRepo.bumpMonthlyAggregate(guildId, y, m, unique, totalMsg);

      await client.query("COMMIT");

      activeEventCache.removeChannel(guildId, row.channel_id);

      const snapshot = await this.events().getSnapshot(eventId);
      if (!snapshot) throw new Error("Snapshot ausente após finalização.");

      const perUserMessages = participants
        .filter((p) => p.message_count > 0)
        .map((p) => ({ userId: p.user_id, count: p.message_count }))
        .sort((a, b) => b.count - a.count);

      return {
        snapshot,
        buckets,
        perUserMessages,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async listEventsForMonth(
    guildId: string,
    year: number,
    month: number,
  ): Promise<EventRow[]> {
    return this.events().listInMonth(guildId, year, month);
  }

  async listParticipants(eventId: string): Promise<ParticipantRow[]> {
    return this.participants().listByEvent(eventId);
  }

  /** Se o membro já confirmou participação pelo botão neste evento. */
  async hasParticipantButtonConfirmed(eventId: string, userId: string): Promise<boolean> {
    return this.participants().hasButtonConfirmation(eventId, userId);
  }

  /** Se existe linha de participação (mensagens e/ou botão). */
  async hasAnyParticipationInEvent(eventId: string, userId: string): Promise<boolean> {
    return this.participants().hasAnyParticipation(eventId, userId);
  }

  /**
   * Remove o membro do evento ativo (sai da dinâmica). Só eventos `active` no guild.
   */
  async leaveEvent(
    eventId: string,
    guildId: string,
    userId: string,
  ): Promise<
    | { ok: true; removed: boolean }
    | { ok: false; reason: "not_found" | "inactive" }
  > {
    const ev = await this.events().findByIdAndGuild(eventId, guildId);
    if (!ev) return { ok: false, reason: "not_found" };
    if (ev.status !== "active") return { ok: false, reason: "inactive" };
    const removed = await this.participants().deleteByEventAndUser(eventId, userId);
    return { ok: true, removed };
  }

  async getSnapshot(eventId: string): Promise<EventSnapshotRow | null> {
    return this.events().getSnapshot(eventId);
  }

  /**
   * Valida evento ativo no servidor e registra clique (anti-duplicidade no repositório).
   */
  async registerParticipantClick(
    eventId: string,
    userId: string,
    guildId: string,
  ): Promise<{
    active: boolean;
    firstRegistration: boolean;
    /** Quem criou o evento não entra na lista de participantes. */
    skippedAsOrganizer?: boolean;
  }> {
    const ev = await this.events().findByIdAndGuild(eventId, guildId);
    if (!ev || ev.status !== "active") {
      return { firstRegistration: false, active: false };
    }
    if (ev.organizer_id === userId) {
      return { firstRegistration: false, active: true, skippedAsOrganizer: true };
    }
    const r = await this.participants().registerButtonClick(eventId, userId, new Date());
    return { firstRegistration: r.firstRegistration, active: true };
  }

  /** Contabiliza mensagem se existir evento ativo no canal. */
  async recordChannelMessage(
    channelId: string,
    guildId: string,
    userId: string,
  ): Promise<{
    recorded: boolean;
    eventId?: string;
    wasNewParticipant?: boolean;
  }> {
    const cached = activeEventCache.get(guildId, channelId);
    if (!cached) return { recorded: false };
    if (cached.organizerId === userId) return { recorded: false };

    const r = await this.participants().recordMessage(cached.eventId, userId, new Date());
    return {
      recorded: true,
      eventId: cached.eventId,
      wasNewParticipant: r.wasNewParticipant,
    };
  }

  /**
   * Remove todos os dados deste servidor (eventos, participantes, snapshots, agregados, logs admin).
   * `event_participants` e `event_snapshots` são removidos em cascata com `events`.
   */
  async deleteAllGuildData(guildId: string): Promise<{
    eventsRemoved: number;
    monthlyRowsRemoved: number;
    adminLogsRemoved: number;
  }> {
    const gid = String(guildId).trim();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Ordem explícita (compatível mesmo se CASCADE não estiver aplicado na BD)
      await client.query(
        `DELETE FROM event_snapshots WHERE event_id IN (SELECT id FROM events WHERE guild_id = $1)`,
        [gid],
      );
      await client.query(
        `DELETE FROM event_participants WHERE event_id IN (SELECT id FROM events WHERE guild_id = $1)`,
        [gid],
      );
      const ev = await client.query(`DELETE FROM events WHERE guild_id = $1`, [gid]);
      const agg = await client.query(`DELETE FROM monthly_aggregates WHERE guild_id = $1`, [gid]);
      const logs = await client.query(`DELETE FROM admin_logs WHERE guild_id = $1`, [gid]);
      // SQLite: sqlite_sequence é atualizado automaticamente; setval/pg é só PostgreSQL.
      await client.query("COMMIT");
      activeEventCache.removeGuild(gid);
      return {
        eventsRemoved: ev.rowCount ?? 0,
        monthlyRowsRemoved: agg.rowCount ?? 0,
        adminLogsRemoved: logs.rowCount ?? 0,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
