import type { Client, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { env } from "../config/env";
import { AdminLogRepository } from "../database/repositories/adminLog.repository";
import type { DbQueryable as Pool } from "../../../db/sqlite-pool";
import { EMBED } from "../utils/embedResponse";

/**
 * Logs administrativos: PostgreSQL + canal Discord opcional.
 */
export class LoggerService {
  constructor(
    private readonly client: Client,
    private readonly pool: Pool,
  ) {}

  private repo(): AdminLogRepository {
    return new AdminLogRepository(this.pool);
  }

  async log(entry: {
    guildId: string;
    actorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.repo().insert(entry);
    const channelId = env.adminLogChannelId;
    if (!channelId) return;
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (!ch?.isTextBased() || ch.isDMBased()) return;
      const text = ch as TextChannel;
      const desc = [
        `**Ação:** ${entry.action}`,
        `**Servidor:** \`${entry.guildId}\``,
        `**Ator:** <@${entry.actorId}>`,
      ];
      if (entry.targetId) desc.push(`**Alvo:** \`${entry.targetId}\``);
      if (entry.payload) {
        desc.push(
          `\`\`\`json\n${JSON.stringify(entry.payload).slice(0, 1800)}\n\`\`\``,
        );
      }
      const embed = new EmbedBuilder()
        .setTitle("Log administrativo")
        .setDescription(desc.join("\n").slice(0, 4000))
        .setColor(EMBED.neutral)
        .setTimestamp(new Date());
      await text.send({ embeds: [embed] });
    } catch {
      // Canal inválido ou sem permissão: log só no DB
    }
  }
}
