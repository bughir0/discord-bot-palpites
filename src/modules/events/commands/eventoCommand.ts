import { setTimeout as sleep } from "node:timers/promises";
import {
  AttachmentBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import type { BotContext } from "../context";
import { replyEphemeralCommand, requireAdmin, requireStaff } from "../utils/permissions";
import { EMBED, embedResponse } from "../utils/embedResponse";
import {
  buildPurgeConfirmationEmbed,
  buildPurgeConfirmationRow,
} from "../interactions/purgeDataButtonHandler";
import {
  buildEventAnnouncementEmbed,
  buildEventClosingReminderEmbed,
  buildParticipateRow,
  buildThankYouEmbeds,
} from "../utils/embeds";
import type { EventRow } from "../models/types";
import { buildParticipationBuckets } from "../services/participation.service";
import { rewardEventParticipants } from "../../points/rewards";
import { GoogleSheetsService } from "../services/googleSheets.service";
import { env as eventsEnv } from "../config/env";
import { sendStaffFinishDm } from "../utils/staffFinishNotification";

function utcNowParts(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function parseEventId(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  return /^\d+$/.test(t) ? t : null;
}

async function clearMessageComponents(
  interaction: ChatInputCommandInteraction,
  channelId: string,
  messageId: string | null,
): Promise<void> {
  if (!messageId) return;
  try {
    const ch = await interaction.client.channels.fetch(channelId);
    if (!ch?.isTextBased() || ch.type === ChannelType.DM) return;
    const msg = await ch.messages.fetch(messageId);
    await msg.edit({ components: [] });
  } catch {
    // mensagem apagada ou sem permissão
  }
}

async function disableOriginalButton(
  interaction: ChatInputCommandInteraction,
  event: EventRow,
): Promise<void> {
  await clearMessageComponents(interaction, event.channel_id, event.embed_message_id);
}

export async function handleEventoCommand(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  switch (sub) {
    case "iniciar":
      await handleIniciar(interaction, ctx);
      break;
    case "finalizar":
      await handleFinalizar(interaction, ctx);
      break;
    case "listar":
      await handleListar(interaction, ctx);
      break;
    case "detalhes":
      await handleDetalhes(interaction, ctx);
      break;
    case "relatorio":
      await handleRelatorio(interaction, ctx);
      break;
    case "participacao":
      await handleParticipacao(interaction, ctx);
      break;
    case "ranking":
      await handleRanking(interaction, ctx);
      break;
    case "exportar":
      await handleExportar(interaction, ctx);
      break;
    case "deletar-dados":
      await handleDeletarDados(interaction, ctx);
      break;
    default:
      await interaction.reply({
        embeds: [embedResponse("Comando", "Subcomando desconhecido.", EMBED.error)],
        ephemeral: true,
      });
  }
}

async function handleIniciar(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!(await requireStaff(interaction))) return;
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Canal inválido",
          "Use este comando em um **canal de texto** do servidor.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const nome = interaction.options.getString("nome", true);
  const descricao = interaction.options.getString("descricao");
  const duracao = interaction.options.getInteger("duracao_minutos");

  await interaction.deferReply({ ephemeral: true });

  try {
    const event = await ctx.eventService.createEvent({
      guildId: interaction.guild.id,
      name: nome,
      description: descricao,
      organizerId: interaction.user.id,
      channelId: interaction.channel.id,
      plannedDurationMinutes: duracao,
    });

    const embed = buildEventAnnouncementEmbed(event, `<@${interaction.user.id}>`);
    const row = buildParticipateRow(event.id);

    const publicMsg = await (interaction.channel as GuildTextBasedChannel).send({
      embeds: [embed],
      components: [row],
    });

    await ctx.eventService.setEmbedMessage(event.id, publicMsg.id);

    await interaction.editReply({
      embeds: [
        embedResponse(
          "Evento iniciado",
          `**${event.name}**\nID: \`${event.id}\`\nA data/hora de início foi registada no **nome** do evento (lista, export e anúncio).`,
          EMBED.ok,
        ),
      ],
    });

    await ctx.logger.log({
      guildId: interaction.guild.id,
      actorId: interaction.user.id,
      action: "EVENT_START",
      targetType: "event",
      targetId: event.id,
      payload: { name: event.name, channelId: interaction.channel.id },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar evento.";
    await interaction.editReply({
      embeds: [embedResponse("Erro", msg, EMBED.error)],
    });
  }
}

async function handleFinalizar(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!(await requireStaff(interaction))) return;
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Canal inválido",
          "Use em um **canal de texto** do servidor.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: false });

  const rawId = interaction.options.getString("evento_id");
  let eventId = parseEventId(rawId);
  if (!eventId) {
    const active = await ctx.eventService.getActiveEventForChannel(interaction.channel.id);
    if (!active) {
      await interaction.editReply({
        embeds: [
          embedResponse(
            "Nenhum evento ativo",
            "Não há evento ativo neste canal. Informe **evento_id** ou use o canal onde o evento foi criado.",
            EMBED.warn,
          ),
        ],
      });
      return;
    }
    eventId = active.id;
  }

  const before = await ctx.eventService.getEvent(interaction.guild.id, eventId);
  if (!before || before.status !== "active") {
    await interaction.editReply({
      embeds: [
        embedResponse(
          "Evento indisponível",
          "Evento não encontrado ou já finalizado.",
          EMBED.error,
        ),
      ],
    });
    return;
  }
  if (before.channel_id !== interaction.channel.id) {
    await interaction.editReply({
      embeds: [
        embedResponse(
          "Canal incorreto",
          "Este evento foi criado noutro canal. Use **/evento finalizar** no canal original do evento para manter o registo de mensagens consistente.",
          EMBED.warn,
        ),
      ],
    });
    return;
  }

  const channel = interaction.channel as GuildTextBasedChannel;
  /** Discord processa no máx. ~50 menções diretas por mensagem; margem para o texto. */
  const MENTION_BATCH = 45;
  /** Tempo para quem só mandou mensagem conseguir clicar em Participar antes do encerramento na BD. */
  const GRACE_MS = 20_000;

  try {
    const participants = await ctx.eventService.listParticipants(eventId);
    const buckets = buildParticipationBuckets(participants);
    const registeredUserIds = [...buckets.buttonOnly, ...buckets.both].sort((a, b) =>
      a.localeCompare(b),
    );
    const messageOnlyUserIds = [...buckets.messageOnly].sort((a, b) => a.localeCompare(b));

    const closingEmbed = buildEventClosingReminderEmbed({
      eventName: before.name,
      moderatorMention: `<@${interaction.user.id}>`,
      registeredUserIds,
      messageOnlyUserIds,
    });
    const row = buildParticipateRow(eventId);

    let lastCallMessage: Message | null = null;

    if (messageOnlyUserIds.length > 0) {
      for (let i = 0; i < messageOnlyUserIds.length; i += MENTION_BATCH) {
        const batch = messageOnlyUserIds.slice(i, i + MENTION_BATCH);
        const content = batch.map((id) => `<@${id}>`).join(" ");
        if (i === 0) {
          lastCallMessage = await channel.send({
            content,
            embeds: [closingEmbed],
            components: [row],
            allowedMentions: { users: batch },
          });
        } else {
          await channel.send({
            content,
            allowedMentions: { users: batch },
          });
        }
      }
      await sleep(GRACE_MS);
    } else {
      lastCallMessage = await channel.send({
        embeds: [closingEmbed],
        components: [row],
      });
    }

    const stats = await ctx.eventService.finalizeEvent(eventId, interaction.guild.id);
    const finishedEvent = await ctx.eventService.getEvent(interaction.guild.id, eventId);
    await disableOriginalButton(interaction, before);

    if (lastCallMessage) {
      try {
        await lastCallMessage.edit({ components: [] });
      } catch {
        // mensagem apagada ou sem permissão
      }
    }

    const embeds = buildThankYouEmbeds(stats, before.name);
    await channel.send({ embeds });

    const graceNote =
      messageOnlyUserIds.length > 0
        ? ` Foi dada uma janela de **${GRACE_MS / 1000}s** após o aviso para quem só tinha mensagens confirmar pelo botão.`
        : "";

    const sheets = new GoogleSheetsService();
    let sheetsSynced = false;
    try {
      if (sheets.isEnabled() && interaction.guild) {
        await sheets.appendFinishedEventRow(interaction.guild, before, stats);
        sheetsSynced = true;
      }
    } catch (sheetErr) {
      console.error("[evento] Google Sheets:", sheetErr);
    }

    let dmNote = "";
    if (finishedEvent) {
      const dmSent = await sendStaffFinishDm(
        interaction.user,
        interaction.guild,
        finishedEvent,
        stats,
        eventsEnv.googleSheetsReportUrl,
        sheetsSynced,
      );
      dmNote = dmSent
        ? "\n📬 Os dados do relatório foram enviados na sua **DM**."
        : "\n⚠️ Não foi possível enviar DM (verifique se suas mensagens diretas estão abertas).";
    }

    await interaction.editReply({
      embeds: [
        embedResponse(
          "Evento finalizado",
          `**${before.name}** foi finalizado.${graceNote} O resumo foi enviado no canal.${dmNote}`,
          EMBED.ok,
        ),
      ],
    });

    try {
      await ctx.logger.log({
        guildId: interaction.guild.id,
        actorId: interaction.user.id,
        action: "EVENT_END",
        targetType: "event",
        targetId: eventId,
        payload: {
          uniqueParticipants: stats.snapshot.unique_participants,
          totalMessages: stats.snapshot.total_messages,
        },
      });
    } catch (logErr) {
      console.error("[evento] log administrativo:", logErr);
    }

    try {
      const participantIds = new Set<string>();
      for (const u of stats.buckets.buttonOnly) participantIds.add(u);
      for (const u of stats.buckets.messageOnly) participantIds.add(u);
      for (const u of stats.buckets.both) participantIds.add(u);
      rewardEventParticipants([...participantIds], eventId);
    } catch (pointsErr) {
      console.error("[evento] pontos de participação:", pointsErr);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao finalizar.";
    await interaction.editReply({
      embeds: [embedResponse("Erro", msg, EMBED.error)],
    });
  }
}

async function handleListar(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireStaff(interaction))) return;
  if (!interaction.guild) {
    await replyEphemeralCommand(
      interaction,
      "Servidor necessário",
      "Use este comando em um **servidor**.",
      EMBED.error,
    );
    return;
  }

  const { year: cy, month: cm } = utcNowParts();
  const mes = interaction.options.getInteger("mes") ?? cm;
  const ano = interaction.options.getInteger("ano") ?? cy;

  const list = await ctx.eventService.listEventsForMonth(interaction.guild.id, ano, mes);
  if (list.length === 0) {
    await interaction.editReply({
      embeds: [
        embedResponse(
          "Lista vazia",
          `Nenhum evento com início ou encerramento em **${mes}/${ano}**.`,
          EMBED.neutral,
        ),
      ],
    });
    return;
  }

  const lines = list.map(
    (e) =>
      `• \`${e.id}\` **${e.name}** — ${e.status} — <t:${Math.floor(e.started_at.getTime() / 1000)}:d>`,
  );
  const embed = new EmbedBuilder()
    .setTitle(`Eventos em ${mes}/${ano}`)
    .setDescription(lines.join("\n").slice(0, 4000))
    .setColor(0x5865f2);

  await interaction.editReply({ embeds: [embed] });
}

async function handleDetalhes(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireStaff(interaction))) return;
  if (!interaction.guild) {
    await replyEphemeralCommand(
      interaction,
      "Servidor necessário",
      "Use este comando em um **servidor**.",
      EMBED.error,
    );
    return;
  }

  const eventId = parseEventId(interaction.options.getString("evento_id", true));
  if (!eventId) {
    await replyEphemeralCommand(
      interaction,
      "ID inválido",
      "Informe um ID numérico de evento.",
      EMBED.error,
    );
    return;
  }

  const ev = await ctx.eventService.getEvent(interaction.guild.id, eventId);
  if (!ev) {
    await interaction.editReply({
      embeds: [embedResponse("Não encontrado", "Evento não encontrado.", EMBED.error)],
    });
    return;
  }

  const participants = await ctx.eventService.listParticipants(eventId);
  const snapshot = await ctx.eventService.getSnapshot(eventId);

  const embed = new EmbedBuilder()
    .setTitle(ev.name)
    .setDescription(ev.description ?? "_Sem descrição_")
    .addFields(
      { name: "ID", value: `\`${ev.id}\``, inline: true },
      { name: "Status", value: ev.status, inline: true },
      { name: "Canal", value: `<#${ev.channel_id}>`, inline: true },
      {
        name: "Início",
        value: `<t:${Math.floor(ev.started_at.getTime() / 1000)}:F>`,
        inline: false,
      },
    )
    .setColor(0x5865f2);

  if (ev.ended_at) {
    embed.addFields({
      name: "Fim",
      value: `<t:${Math.floor(ev.ended_at.getTime() / 1000)}:F>`,
      inline: false,
    });
  }

  if (snapshot) {
    embed.addFields({
      name: "Snapshot (finalização)",
      value: [
        `Participantes únicos: ${snapshot.unique_participants}`,
        `Total msgs: ${snapshot.total_messages}`,
        `Só botão: ${snapshot.count_button_only} | Só msg: ${snapshot.count_message_only} | Ambos: ${snapshot.count_both}`,
      ].join("\n"),
      inline: false,
    });
  }

  const partsEmbed = new EmbedBuilder()
    .setTitle("Participantes")
    .setDescription(
      participants.length
        ? participants
            .map((p) => {
              const bits: string[] = [];
              if (p.clicked_button_at) bits.push("botão");
              if (p.message_count > 0) bits.push(`${p.message_count} msg(s)`);
              return `<@${p.user_id}> — ${bits.join(", ") || "registro vazio"}`;
            })
            .join("\n")
            .slice(0, 4000)
        : "_Nenhum participante registrado._",
    )
    .setColor(0x2f3136);

  await interaction.editReply({ embeds: [embed, partsEmbed] });
}

async function handleRelatorio(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireStaff(interaction))) return;
  if (!interaction.guild) {
    await replyEphemeralCommand(
      interaction,
      "Servidor necessário",
      "Use este comando em um **servidor**.",
      EMBED.error,
    );
    return;
  }

  const { year: cy, month: cm } = utcNowParts();
  const mes = interaction.options.getInteger("mes") ?? cm;
  const ano = interaction.options.getInteger("ano") ?? cy;

  const report = await ctx.reportService.getMonthlyReport(interaction.guild.id, ano, mes);
  const agg = report.aggregate;

  const embed = new EmbedBuilder()
    .setTitle(`Relatório ${mes}/${ano}`)
    .setColor(0x57f287)
    .addFields(
      {
        name: "Eventos finalizados (no mês)",
        value: String(report.eventsInMonth.length),
        inline: true,
      },
      {
        name: "Agregado (tabela mensal)",
        value: agg
          ? [
              `Eventos contabilizados: ${agg.events_finished}`,
              `Participações (soma): ${agg.total_participations}`,
              `Mensagens (soma): ${agg.total_messages}`,
            ].join("\n")
          : "_Sem dados agregados ainda._",
        inline: false,
      },
    );

  if (report.eventsInMonth.length > 0) {
    embed.addFields({
      name: "Lista (IDs)",
      value: report.eventsInMonth
        .map((e) => `\`${e.id}\` ${e.name}`)
        .join("\n")
        .slice(0, 1000),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleParticipacao(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      embeds: [
        embedResponse(
          "Servidor necessário",
          "Use este comando em um **servidor**.",
          EMBED.error,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("membro") ?? interaction.user;
  await interaction.deferReply({ ephemeral: true });

  const { ended, active } = await ctx.eventService.getParticipationCountsForMember(
    interaction.guild.id,
    target.id,
  );

  const self = target.id === interaction.user.id;

  const embed = new EmbedBuilder()
    .setTitle("Participação em eventos")
    .setColor(EMBED.brand)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .setDescription(
      self
        ? "Histórico no **servidor atual** (registro por botão e/ou mensagens durante o evento)."
        : `Estatísticas de ${target} neste servidor.`,
    )
    .addFields(
      {
        name: "Eventos finalizados",
        value: self
          ? `Você participou de **${ended}** evento(s) já finalizado(s).`
          : `${target} participou de **${ended}** evento(s) já finalizado(s).`,
        inline: false,
      },
      {
        name: "Eventos ativos agora",
        value: self
          ? `Você está registrado(a) em **${active}** evento(s) ativo(s) neste momento.`
          : `${target} está registrado(a) em **${active}** evento(s) ativo(s) neste momento.`,
        inline: false,
      },
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleRanking(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireStaff(interaction))) return;
  if (!interaction.guild) {
    await replyEphemeralCommand(
      interaction,
      "Servidor necessário",
      "Use este comando em um **servidor**.",
      EMBED.error,
    );
    return;
  }

  const { year: cy, month: cm } = utcNowParts();
  const mes = interaction.options.getInteger("mes") ?? cm;
  const ano = interaction.options.getInteger("ano") ?? cy;
  const limite = interaction.options.getInteger("limite") ?? 10;

  const rows = await ctx.reportService.getRanking(
    interaction.guild.id,
    ano,
    mes,
    Math.min(50, Math.max(1, limite)),
  );

  if (rows.length === 0) {
    await interaction.editReply({
      embeds: [
        embedResponse(
          "Sem dados",
          "Não há dados de ranking neste período.",
          EMBED.neutral,
        ),
      ],
    });
    return;
  }

  const desc = rows
    .map((r, i) => {
      return `${i + 1}. <@${r.user_id}> — **${r.total_messages}** msgs em **${r.events_joined}** evento(s)`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle(`Ranking de participação — ${mes}/${ano}`)
    .setDescription(desc.slice(0, 4000))
    .setColor(0xfee75c);

  await interaction.editReply({ embeds: [embed] });
}

async function handleExportar(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!(await requireAdmin(interaction))) return;
  if (!interaction.guild) {
    await replyEphemeralCommand(
      interaction,
      "Servidor necessário",
      "Use este comando em um **servidor**.",
      EMBED.error,
    );
    return;
  }

  const { year: cy, month: cm } = utcNowParts();
  const mes = interaction.options.getInteger("mes") ?? cm;
  const ano = interaction.options.getInteger("ano") ?? cy;
  const formato = interaction.options.getString("formato", true) as "json" | "csv";

  const payload = await ctx.exportService.buildMonthExport(interaction.guild.id, ano, mes);
  const buf =
    formato === "json"
      ? Buffer.from(JSON.stringify(payload, null, 2), "utf8")
      : Buffer.from(ctx.exportService.toCsv(payload), "utf8");

  const ext = formato === "json" ? "json" : "csv";
  const att = new AttachmentBuilder(buf, {
    name: `eventos-${interaction.guild.id}-${ano}-${mes}.${ext}`,
  });

  await interaction.editReply({
    embeds: [
      embedResponse(
        "Exportação pronta",
        `Formato **${ext.toUpperCase()}** · ${payload.events.length} evento(s) no período.`,
        EMBED.ok,
      ),
    ],
    files: [att],
  });

  await ctx.logger.log({
    guildId: interaction.guild.id,
    actorId: interaction.user.id,
    action: "DATA_EXPORT",
    payload: { formato, mes, ano, eventCount: payload.events.length },
  });
}

async function handleDeletarDados(
  interaction: ChatInputCommandInteraction,
  _ctx: BotContext,
): Promise<void> {
  if (!(await requireAdmin(interaction))) return;
  if (!interaction.guild) {
    await replyEphemeralCommand(
      interaction,
      "Servidor necessário",
      "Use este comando em um **servidor**.",
      EMBED.error,
    );
    return;
  }

  await interaction.reply({
    embeds: [buildPurgeConfirmationEmbed()],
    components: [buildPurgeConfirmationRow()],
    ephemeral: true,
  });
}
