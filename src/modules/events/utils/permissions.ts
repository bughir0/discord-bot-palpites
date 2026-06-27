import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { env } from "../config/env";
import { EMBED, embedResponse } from "./embedResponse";

/**
 * Resposta ephemeral que funciona antes ou depois de `deferReply`
 * (evita "The application did not respond" e erros duplicados).
 */
export async function replyEphemeralCommand(
  interaction: ChatInputCommandInteraction,
  title: string,
  description: string,
  color: number = EMBED.error,
): Promise<void> {
  const embeds = [embedResponse(title, description, color)];
  if (interaction.deferred) {
    await interaction.editReply({ embeds });
  } else {
    await interaction.reply({ embeds, ephemeral: true });
  }
}

function memberHasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  if (roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

/** Staff: cargos em STAFF_ROLE_IDS ou permissão Gerenciar Servidor. */
export function isStaff(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  return memberHasAnyRole(member, [...env.staffRoleIds]);
}

/** Admin: cargos em ADMIN_ROLE_IDS ou Gerenciar Servidor (alinhado a operações sensíveis). */
export function isAdmin(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (env.adminRoleIds.length > 0) return memberHasAnyRole(member, [...env.adminRoleIds]);
  return false;
}

export async function requireStaff(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const m = interaction.member;
  if (!m || typeof m === "string" || !("roles" in m)) {
    await replyEphemeralCommand(
      interaction,
      "Servidor necessário",
      "Este comando só pode ser usado em um **servidor**.",
      EMBED.error,
    );
    return false;
  }
  if (!isStaff(m as GuildMember)) {
    await replyEphemeralCommand(
      interaction,
      "Sem permissão",
      "É necessário cargo de **staff** (configurado no bot) ou a permissão **Gerenciar servidor**.",
      EMBED.error,
    );
    return false;
  }
  return true;
}

export async function requireAdmin(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const m = interaction.member;
  if (!m || typeof m === "string" || !("roles" in m)) {
    await replyEphemeralCommand(
      interaction,
      "Servidor necessário",
      "Este comando só pode ser usado em um **servidor**.",
      EMBED.error,
    );
    return false;
  }
  if (!isAdmin(m as GuildMember)) {
    await replyEphemeralCommand(
      interaction,
      "Sem permissão",
      "Apenas **administradores** (cargo configurado ou **Gerenciar servidor**) podem usar esta ação.",
      EMBED.error,
    );
    return false;
  }
  return true;
}
