import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from "discord.js";
import type { BotContext } from "../context";
import {
  buildLeaveConfirmId,
  buildParticipateConfirmId,
  PARTICIPATE_CANCEL_ID,
  PARTICIPATE_LEAVE_CANCEL_ID,
  parseParticipateCustomId,
} from "../utils/constants";
import { refreshEventAnnouncementEmbed } from "../utils/eventAnnouncementRefresh";
import { EMBED, embedResponse } from "../utils/embedResponse";

function buildParticipateConfirmRow(eventId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildParticipateConfirmId(eventId))
      .setLabel("Sim, participar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(PARTICIPATE_CANCEL_ID)
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildLeaveConfirmRow(eventId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildLeaveConfirmId(eventId))
      .setLabel("Sim, sair")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(PARTICIPATE_LEAVE_CANCEL_ID)
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Botões do anúncio e confirmações ephemeral (participar / sair).
 */
export async function handleParticipateButton(
  interaction: ButtonInteraction,
  ctx: BotContext,
): Promise<void> {
  const parsed = parseParticipateCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Interação inválida",
          "Este botão não é válido ou foi usado fora de um servidor.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (parsed.kind === "cancel") {
    await interaction.update({
      embeds: [
        embedResponse(
          "Participação não confirmada",
          [
            "Você **cancelou** — não registramos sua participação neste evento.",
            "",
            "Se mudar de ideia, use de novo o botão **Participar da dinâmica** no anúncio do evento.",
          ].join("\n"),
          EMBED.neutral,
        ),
      ],
      components: [],
    });
    return;
  }

  if (parsed.kind === "leaveCancel") {
    await interaction.update({
      embeds: [
        embedResponse(
          "Saída cancelada",
          "Você continua na lista de participantes deste evento.",
          EMBED.neutral,
        ),
      ],
      components: [],
    });
    return;
  }

  if (parsed.kind === "leavePrompt") {
    await handleLeavePrompt(interaction, ctx, parsed.eventId);
    return;
  }

  if (parsed.kind === "leaveConfirm") {
    await handleLeaveConfirm(interaction, ctx, parsed.eventId);
    return;
  }

  if (parsed.kind === "prompt" || parsed.kind === "legacy") {
    await handleParticipatePrompt(interaction, ctx, parsed.eventId);
    return;
  }

  if (parsed.kind === "confirm") {
    await handleParticipateConfirm(interaction, ctx, parsed.eventId);
  }
}

async function handleLeavePrompt(
  interaction: ButtonInteraction,
  ctx: BotContext,
  eventId: string,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Interação inválida",
          "Use este botão dentro de um servidor.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const ev = await ctx.eventService.getEvent(interaction.guildId, eventId);
  if (!ev || ev.status !== "active") {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Evento indisponível",
          "Este evento não está mais ativo. Não é possível sair pela lista.",
          EMBED.warn,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const inList = await ctx.eventService.hasAnyParticipationInEvent(
    eventId,
    interaction.user.id,
  );
  if (!inList) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Você não está na lista",
          "Não há registro seu neste evento (nem por mensagens nem pelo botão **Participar**). Use **Participar da dinâmica** para entrar.",
          EMBED.neutral,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [
      embedResponse(
        "Confirmar saída",
        [
          "Deseja **sair da dinâmica**? Seu nome será **removido** da lista do evento.",
          "",
          "Depois de sair, suas mensagens neste canal deixam de contar para este evento até você participar de novo.",
        ].join("\n"),
        EMBED.warn,
      ),
    ],
    components: [buildLeaveConfirmRow(eventId)],
    ephemeral: true,
  });
}

async function handleLeaveConfirm(
  interaction: ButtonInteraction,
  ctx: BotContext,
  eventId: string,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Interação inválida",
          "Este botão não é válido ou foi usado fora de um servidor.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const result = await ctx.eventService.leaveEvent(
    eventId,
    interaction.guildId,
    interaction.user.id,
  );

  if (!result.ok) {
    await interaction.update({
      embeds: [
        embedResponse(
          "Não foi possível sair",
          result.reason === "inactive"
            ? "Este evento já foi finalizado ou não está mais ativo."
            : "Evento não encontrado.",
          EMBED.error,
        ),
      ],
      components: [],
    });
    return;
  }

  if (!result.removed) {
    await interaction.update({
      embeds: [
        embedResponse(
          "Nada a alterar",
          "Não havia registro seu para remover (pode ter sido removido já).",
          EMBED.neutral,
        ),
      ],
      components: [],
    });
    return;
  }

  await interaction.update({
    embeds: [
      embedResponse(
        "Você saiu da dinâmica",
        "Seu nome foi removido da lista do evento no anúncio.",
        EMBED.ok,
      ),
    ],
    components: [],
  });

  await refreshEventAnnouncementEmbed(ctx, interaction.guildId, eventId);

  await ctx.logger.log({
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    action: "EVENT_PARTICIPATE_LEAVE",
    targetType: "event",
    targetId: eventId,
  });
}

async function handleParticipatePrompt(
  interaction: ButtonInteraction,
  ctx: BotContext,
  eventId: string,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Interação inválida",
          "Use este botão dentro de um servidor.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const ev = await ctx.eventService.getEvent(interaction.guildId, eventId);
  if (!ev || ev.status !== "active") {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Evento indisponível",
          "Este evento não está mais ativo ou não existe.",
          EMBED.warn,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (ev.organizer_id === interaction.user.id) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Organizador",
          "Quem organiza o evento **não entra** na lista de participantes da dinâmica.",
          EMBED.neutral,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const alreadyConfirmed = await ctx.eventService.hasParticipantButtonConfirmed(
    eventId,
    interaction.user.id,
  );
  if (alreadyConfirmed) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Participação já confirmada",
          [
            "Você **já confirmou** participação neste evento pelo botão.",
            "Para **remover seu nome** da lista, use **Sair da dinâmica** no anúncio.",
          ].join("\n"),
          EMBED.neutral,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [
      embedResponse(
        "Confirmar participação",
        [
          "Deseja realmente **confirmar participação** neste evento?",
          "",
          "Se mudar de ideia, clique em **Cancelar**.",
        ].join("\n"),
        EMBED.brand,
      ),
    ],
    components: [buildParticipateConfirmRow(eventId)],
    ephemeral: true,
  });
}

async function handleParticipateConfirm(
  interaction: ButtonInteraction,
  ctx: BotContext,
  eventId: string,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Interação inválida",
          "Este botão não é válido ou foi usado fora de um servidor.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const result = await ctx.eventService.registerParticipantClick(
    eventId,
    interaction.user.id,
    interaction.guildId,
  );

  if (result.skippedAsOrganizer) {
    await interaction.update({
      embeds: [
        embedResponse(
          "Organizador",
          "Quem organiza o evento não participa da lista. Os demais membros usam **Participar da dinâmica**.",
          EMBED.neutral,
        ),
      ],
      components: [],
    });
    return;
  }

  if (!result.active) {
    await interaction.update({
      embeds: [
        embedResponse(
          "Evento indisponível",
          "Este evento não está mais ativo ou não existe.",
          EMBED.warn,
        ),
      ],
      components: [],
    });
    return;
  }

  if (!result.firstRegistration) {
    const c = await ctx.eventService.getParticipationCountsForMember(
      interaction.guildId,
      interaction.user.id,
    );
    await interaction.update({
      embeds: [
        embedResponse(
          "Nada a alterar",
          [
            "Você **já tinha** confirmado participação neste evento (por exemplo, clicando em **Sim, participar** antes).",
            "Para sair da lista, use **Sair da dinâmica** no anúncio do evento.",
            "",
            `**Neste servidor:** **${c.ended}** evento(s) finalizado(s) em que você participou · **${c.active}** evento(s) ativo(s) com o seu registro.`,
          ].join("\n"),
          EMBED.neutral,
        ),
      ],
      components: [],
    });
    return;
  }

  const counts = await ctx.eventService.getParticipationCountsForMember(
    interaction.guildId,
    interaction.user.id,
  );

  await interaction.update({
    embeds: [
      embedResponse(
        "Participação registrada",
        [
          "Sua participação foi registrada com sucesso.",
          "",
          `**Neste servidor:** **${counts.ended}** evento(s) finalizado(s) em que você já participou · **${counts.active}** evento(s) ativo(s) com o seu registro (inclui este, se for o caso).`,
        ].join("\n"),
        EMBED.ok,
      ),
    ],
    components: [],
  });

  await refreshEventAnnouncementEmbed(ctx, interaction.guildId, eventId);

  await ctx.logger.log({
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    action: "EVENT_PARTICIPATE_BUTTON",
    targetType: "event",
    targetId: eventId,
  });
}
