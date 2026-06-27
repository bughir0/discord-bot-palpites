import type { EventRow } from "../models/types";

export type CachedActiveEvent = {
  eventId: string;
  guildId: string;
  channelId: string;
  organizerId: string;
};

/**
 * Cache em memória de eventos ativos por canal.
 * Evita consulta ao PostgreSQL em cada messageCreate quando não há evento no canal.
 */
class ActiveEventCache {
  private readonly byChannel = new Map<string, CachedActiveEvent>();

  private key(guildId: string, channelId: string): string {
    return `${guildId}:${channelId}`;
  }

  setFromEvent(event: EventRow): void {
    if (event.status !== "active") return;
    this.byChannel.set(this.key(event.guild_id, event.channel_id), {
      eventId: event.id,
      guildId: event.guild_id,
      channelId: event.channel_id,
      organizerId: event.organizer_id,
    });
  }

  get(guildId: string, channelId: string): CachedActiveEvent | null {
    return this.byChannel.get(this.key(guildId, channelId)) ?? null;
  }

  removeChannel(guildId: string, channelId: string): void {
    this.byChannel.delete(this.key(guildId, channelId));
  }

  removeGuild(guildId: string): void {
    for (const [key, value] of this.byChannel) {
      if (value.guildId === guildId) this.byChannel.delete(key);
    }
  }

  clear(): void {
    this.byChannel.clear();
  }

  size(): number {
    return this.byChannel.size;
  }
}

export const activeEventCache = new ActiveEventCache();
