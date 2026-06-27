import { ChannelType } from "discord.js";
import type { BotContext } from "../context";
import { buildEventAnnouncementEmbed, buildParticipateRow } from "./embeds";

/**
 * Reconstrói o embed do anúncio com a lista atual de participantes e mantém o botão.
 */
export async function refreshEventAnnouncementEmbed(
  ctx: BotContext,
  guildId: string,
  eventId: string,
): Promise<void> {
  const event = await ctx.eventService.getEvent(guildId, eventId);
  if (!event || event.status !== "active" || !event.embed_message_id) return;

  const participants = await ctx.eventService.listParticipants(eventId);

  try {
    const ch = await ctx.client.channels.fetch(event.channel_id);
    if (!ch?.isTextBased() || ch.type === ChannelType.DM) return;

    const msg = await ch.messages.fetch(event.embed_message_id);
    const embed = buildEventAnnouncementEmbed(
      event,
      `<@${event.organizer_id}>`,
      participants,
    );
    await msg.edit({
      embeds: [embed],
      components: [buildParticipateRow(eventId)],
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[eventAnnouncementRefresh] Falha ao atualizar anúncio eventId=${eventId} guildId=${guildId}: ${reason}`,
    );
  }
}
