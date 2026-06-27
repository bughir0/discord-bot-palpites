import type { Client, Interaction } from 'discord.js';
import { EmbedBuilder, type TextChannel } from 'discord.js';
import { env } from '../../config';
import { log } from '../../utils/logger';

declare module 'discord.js' {
  interface Client {
    logAction?: (action: string, details: string, interaction: Interaction) => Promise<void>;
  }
}

export async function postCoLog(
  client: Client,
  action: string,
  details: string,
  footer?: string,
): Promise<void> {
  const channelId = env.coLogChannelId;
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setTitle(`📝 Log: ${action}`)
      .setDescription(details.slice(0, 4000))
      .setColor(0x0099ff)
      .setTimestamp();
    if (footer) embed.setFooter({ text: footer });
    await (ch as TextChannel).send({ embeds: [embed] });
  } catch (e) {
    log.error('[points] Falha ao enviar log:', e);
  }
}

export function attachClientLogAction(client: Client): void {
  client.logAction = async (action: string, details: string, interaction: Interaction) => {
    await postCoLog(client, action, details, `Por ${interaction.user.tag}`);
  };
}
