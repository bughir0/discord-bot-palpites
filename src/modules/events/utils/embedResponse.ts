import { EmbedBuilder } from "discord.js";

export const EMBED = {
  brand: 0x5865f2,
  ok: 0x57f287,
  error: 0xed4245,
  warn: 0xfee75c,
  neutral: 0x2f3136,
} as const;

export function embedResponse(
  title: string,
  description: string,
  color: number = EMBED.brand,
): EmbedBuilder {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
}
