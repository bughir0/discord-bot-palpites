import type { DbQueryable as Pool } from "../../../db/sqlite-pool";
import { EventRepository } from "../database/repositories/event.repository";
import { ParticipantRepository } from "../database/repositories/participant.repository";

export interface ExportPayload {
  generatedAt: string;
  guildId: string;
  year: number;
  month: number;
  events: {
    id: string;
    name: string;
    description: string | null;
    organizer_id: string;
    channel_id: string;
    started_at: string;
    ended_at: string | null;
    status: string;
    participants: {
      user_id: string;
      clicked_button_at: string | null;
      first_message_at: string | null;
      last_message_at: string | null;
      message_count: number;
    }[];
  }[];
}

export class ExportService {
  constructor(private readonly pool: Pool) {}

  async buildMonthExport(
    guildId: string,
    year: number,
    month: number,
  ): Promise<ExportPayload> {
    const evRepo = new EventRepository(this.pool);
    const partRepo = new ParticipantRepository(this.pool);
    const events = await evRepo.listStartedInMonth(guildId, year, month);
    const out: ExportPayload["events"] = [];
    for (const e of events) {
      const parts = await partRepo.listByEvent(e.id);
      out.push({
        id: e.id,
        name: e.name,
        description: e.description,
        organizer_id: e.organizer_id,
        channel_id: e.channel_id,
        started_at: e.started_at.toISOString(),
        ended_at: e.ended_at ? e.ended_at.toISOString() : null,
        status: e.status,
        participants: parts.map((p) => ({
          user_id: p.user_id,
          clicked_button_at: p.clicked_button_at ? p.clicked_button_at.toISOString() : null,
          first_message_at: p.first_message_at ? p.first_message_at.toISOString() : null,
          last_message_at: p.last_message_at ? p.last_message_at.toISOString() : null,
          message_count: p.message_count,
        })),
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      guildId,
      year,
      month,
      events: out,
    };
  }

  toCsv(payload: ExportPayload): string {
    const lines: string[] = [
      "event_id,event_name,user_id,message_count,clicked_button,first_msg,last_msg,status",
    ];
    for (const ev of payload.events) {
      if (ev.participants.length === 0) {
        lines.push(
          `${this.csv(ev.id)},${this.csv(ev.name)},,,,,,${this.csv(ev.status)}`,
        );
      } else {
        for (const p of ev.participants) {
          lines.push(
            [
              this.csv(ev.id),
              this.csv(ev.name),
              this.csv(p.user_id),
              String(p.message_count),
              p.clicked_button_at ? "1" : "0",
              p.first_message_at ?? "",
              p.last_message_at ?? "",
              this.csv(ev.status),
            ].join(","),
          );
        }
      }
    }
    return lines.join("\n");
  }

  private csv(s: string): string {
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
}
