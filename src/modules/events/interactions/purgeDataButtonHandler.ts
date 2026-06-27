import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  EmbedBuilder,
} from "discord.js";
import type { InteractionEditReplyOptions } from "discord.js";
import type { GuildMember } from "discord.js";
import type { BotContext } from "../context";
import { isAdmin } from "../utils/permissions";
import { EMBED, embedResponse } from "../utils/embedResponse";

export const PURGE_BUTTON_CONFIRM = "evt:purge:confirm";
export const PURGE_BUTTON_CANCEL = "evt:purge:cancel";

export function buildPurgeConfirmationRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PURGE_BUTTON_CONFIRM)
      .setLabel("Apagar todos os dados")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(PURGE_BUTTON_CANCEL)
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildPurgeConfirmationEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Apagar dados do servidor")
    .setColor(EMBED.warn)
    .setDescription(
      [
        "Esta ação remove **todos** os registros deste servidor no bot:",
        "· eventos, participantes e snapshots",
        "· agregados mensais e logs administrativos",
        "",
        "**É irreversível.** Clique em **Apagar todos os dados** apenas se tiver certeza.",
      ].join("\n"),
    );
}

/** Mensagens ephemeral não suportam `message.edit()` pelo canal — usa webhook da interação. */
async function editPurgeResult(
  interaction: ButtonInteraction,
  options: InteractionEditReplyOptions,
): Promise<void> {
  try {
    await interaction.editReply(options);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ? (e as { code: number }).code : undefined;
    if (code === 10008) {
      await interaction.followUp({
        embeds: options.embeds,
        components: options.components,
        files: options.files,
        ephemeral: true,
      });
      return;
    }
    throw e;
  }
}

export async function handlePurgeDataButton(
  interaction: ButtonInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      embeds: [
        embedResponse("Erro", "Este botão só funciona dentro de um servidor.", EMBED.error),
      ],
      ephemeral: true,
    });
    return;
  }

  const m = interaction.member;
  if (!m || typeof m === "string" || !("roles" in m)) {
    await interaction.reply({
      embeds: [embedResponse("Erro", "Não foi possível verificar suas permissões.", EMBED.error)],
      ephemeral: true,
    });
    return;
  }
  if (!isAdmin(m as GuildMember)) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Sem permissão",
          "Apenas administradores podem confirmar esta ação.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const id = interaction.customId;

  if (id === PURGE_BUTTON_CANCEL) {
    await interaction.update({
      embeds: [
        embedResponse(
          "Cancelado",
          "Nenhum dado foi apagado.",
          EMBED.neutral,
        ),
      ],
      components: [],
    });
    return;
  }

  if (id !== PURGE_BUTTON_CONFIRM) return;

  await interaction.deferUpdate();

  try {
    const stats = await ctx.eventService.deleteAllGuildData(interaction.guildId);
    await editPurgeResult(interaction, {
      embeds: [
        embedResponse(
          "Dados apagados",
          [
            "Todos os registros deste servidor foram removidos do banco de dados do bot.",
            "",
            `· Eventos removidos: **${stats.eventsRemoved}**`,
            `· Agregados mensais: **${stats.monthlyRowsRemoved}**`,
            `· Logs administrativos: **${stats.adminLogsRemoved}**`,
          ].join("\n"),
          EMBED.ok,
        ),
      ],
      components: [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao apagar dados.";
    console.error("[purge]", e);
    try {
      await editPurgeResult(interaction, {
        embeds: [embedResponse("Erro ao apagar", msg, EMBED.error)],
        components: [],
      });
    } catch (e2) {
      console.error("[purge] Falha ao mostrar erro:", e2);
    }
  }
}
