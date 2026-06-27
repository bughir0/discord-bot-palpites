import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ColorResolvable,
} from "discord.js";
import { buildLeavePromptId, buildParticipatePromptId } from "./constants";
import type { EventRow, EventFinishStats, ParticipantRow } from "../models/types";
import { EMBED } from "./embedResponse";
import { formatUserList } from "./text";

const BRAND: ColorResolvable = 0x5865f2;

const PARTICIPANT_FIELD_MAX = 1024;

function formatParticipantFieldValue(participants: ParticipantRow[]): string {
  if (participants.length === 0) return "_Ninguém registrado ainda._";
  const sorted = [...participants].sort((a, b) => a.user_id.localeCompare(b.user_id));
  const mentions = sorted.map((p) => `<@${p.user_id}>`);
  let out = "";
  let shown = 0;
  for (const m of mentions) {
    const next = out ? `${out}, ${m}` : m;
    if (next.length > PARTICIPANT_FIELD_MAX - 24) {
      const rest = mentions.length - shown;
      return `${out}…\n_+${rest} participante(s)._`;
    }
    out = next;
    shown++;
  }
  return out;
}

export function buildEventAnnouncementEmbed(
  event: EventRow,
  organizerTag: string,
  participants: ParticipantRow[] = [],
): EmbedBuilder {
  const dur =
    event.planned_duration_seconds != null
      ? `${Math.floor(event.planned_duration_seconds / 60)} min (planejada)`
      : "Até encerramento manual";
  return new EmbedBuilder()
    .setTitle(`Evento: ${event.name}`.slice(0, 256))
    .setDescription(event.description ?? "_Sem descrição_")
    .setColor(BRAND)
    .addFields(
      { name: "Organizador", value: organizerTag, inline: true },
      { name: "ID do evento", value: `\`${event.id}\``, inline: true },
      { name: "Duração planejada", value: dur, inline: true },
      {
        name: "Início",
        value: `<t:${Math.floor(event.started_at.getTime() / 1000)}:F>`,
        inline: false,
      },
      {
        name: `Participantes (${participants.length})`,
        value: formatParticipantFieldValue(participants),
        inline: false,
      },
    )
    .setFooter({
      text: "Use Participar para entrar ou Sair para remover seu nome da lista (enquanto o evento estiver ativo).",
    });
}

export function buildParticipateRow(eventId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildParticipatePromptId(eventId))
      .setLabel("Participar da dinâmica")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildLeavePromptId(eventId))
      .setLabel("Sair da dinâmica")
      .setStyle(ButtonStyle.Danger),
  );
}

/** Aviso antes de encerrar: quem já confirmou pelo botão e lembrete para quem só mandou mensagem. */
export function buildEventClosingReminderEmbed(params: {
  eventName: string;
  moderatorMention: string;
  registeredUserIds: string[];
  messageOnlyUserIds: string[];
}): EmbedBuilder {
  const { eventName, moderatorMention, registeredUserIds, messageOnlyUserIds } = params;
  const pending = messageOnlyUserIds.length;
  return new EmbedBuilder()
    .setTitle("Evento a finalizar")
    .setColor(EMBED.warn)
    .setDescription(
      [
        `**${eventName}** vai ser encerrado por ${moderatorMention}.`,
        "",
        "Se você **mandou mensagens no canal** do evento mas **ainda não clicou em Participar da dinâmica**, confirme **agora** (no anúncio original ou nos botões desta mensagem) para **registar a participação** e não ficar de fora do registo oficial.",
        pending > 0
          ? `\n_Há **${pending}** membro(s) com mensagens contabilizadas que ainda não confirmaram pelo botão — receberam menção no canal._`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .addFields(
      {
        name: `Já registraram participação — botão (${registeredUserIds.length})`,
        value: formatUserList(registeredUserIds, 25),
        inline: false,
      },
      {
        name: `Só mensagens, sem botão ainda (${messageOnlyUserIds.length})`,
        value: formatUserList(messageOnlyUserIds, 25),
        inline: false,
      },
    )
    .setFooter({
      text: "Após o encerramento, o botão deixará de funcionar. Quem confirmar a tempo entra no registo como nos eventos anteriores.",
    });
}

export function buildThankYouEmbeds(stats: EventFinishStats, eventName: string): EmbedBuilder[] {
  const { snapshot, buckets } = stats;
  const main = new EmbedBuilder()
    .setTitle("Evento finalizado — obrigado!")
    .setDescription(`**${eventName}** foi finalizado com sucesso.`)
    .setColor(0x57f287)
    .addFields(
      {
        name: "Apenas botão",
        value: formatUserList(buckets.buttonOnly),
        inline: false,
      },
      {
        name: "Apenas mensagens",
        value: formatUserList(buckets.messageOnly),
        inline: false,
      },
      {
        name: "Botão e mensagens",
        value: formatUserList(buckets.both),
        inline: false,
      },
      {
        name: "Resumo",
        value: [
          `Participantes únicos: **${snapshot.unique_participants}**`,
          `Total de mensagens: **${snapshot.total_messages}**`,
          `Só botão: ${snapshot.count_button_only} | Só msg: ${snapshot.count_message_only} | Ambos: ${snapshot.count_both}`,
        ].join("\n"),
        inline: false,
      },
    );

  const ranking = stats.perUserMessages.slice(0, 15);
  const rankEmbed =
    ranking.length > 0
      ? new EmbedBuilder()
          .setTitle("Mensagens por participante (top 15)")
          .setColor(BRAND)
          .setDescription(
            ranking.map((r, i) => `${i + 1}. <@${r.userId}> — **${r.count}**`).join("\n"),
          )
      : null;

  return rankEmbed ? [main, rankEmbed] : [main];
}
