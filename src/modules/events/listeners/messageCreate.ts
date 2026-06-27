import type { Message } from "discord.js";
import type { BotContext } from "../context";
import { refreshEventAnnouncementEmbed } from "../utils/eventAnnouncementRefresh";

/**
 * Conta mensagens de membros humanos no canal onde há evento ativo.
 * Ignora bots e DMs.
 */
export function createMessageCreateListener(ctx: BotContext) {
  return async (message: Message): Promise<void> => {
    try {
      if (!message.guild || message.author.bot) return;
      if (message.channel.isDMBased()) return;

      const result = await ctx.eventService.recordChannelMessage(
        message.channel.id,
        message.guild.id,
        message.author.id,
      );
      if (!result.recorded || !result.eventId) return;

      if (result.wasNewParticipant) {
        await refreshEventAnnouncementEmbed(ctx, message.guild.id, result.eventId);
      }
    } catch (e) {
      console.error("[messageCreate]", e);
    }
  };
}
