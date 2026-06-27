import type { Guild } from "discord.js";

/** Nome de exibição do membro (ou username / ID como fallback). */
export async function resolveMemberLabel(guild: Guild, userId: string): Promise<string> {
  try {
    const m = await guild.members.fetch({ user: userId, force: false });
    return m.displayName || m.user.username;
  } catch {
    try {
      const u = await guild.client.users.fetch(userId);
      return u.username;
    } catch {
      return userId;
    }
  }
}
