import { EmbedBuilder, type Guild, type User } from "discord.js";
import type { EventFinishStats, EventRow } from "../models/types";
import { eventBaseNameForSheet } from "./eventDate";
import { resolveMemberLabel } from "./memberLabel";
import {
  buildSheetReportRow,
  formatSheetReportRowCopyPaste,
  type SheetReportRow,
} from "./sheetReportRow";
import { formatUserList } from "./text";

export function buildStaffFinishDmEmbeds(
  event: EventRow,
  stats: EventFinishStats,
  sheetRow: SheetReportRow,
  reportUrl: string,
  finalizedByUserId: string,
  sheetsAutoSynced: boolean,
): EmbedBuilder[] {
  const { snapshot, buckets } = stats;
  const endedAt = event.ended_at;

  const summary = new EmbedBuilder()
    .setTitle("Evento finalizado — dados do relatório")
    .setColor(0x5865f2)
    .setDescription(
      `Você finalizou **${eventBaseNameForSheet(event.name)}** (\`${event.id}\`). Guarde estes dados para o **Report das dinâmicas**.`,
    )
    .addFields(
      {
        name: "Início",
        value: `<t:${Math.floor(event.started_at.getTime() / 1000)}:F>`,
        inline: true,
      },
      {
        name: "Fim",
        value: endedAt ? `<t:${Math.floor(endedAt.getTime() / 1000)}:F>` : "—",
        inline: true,
      },
      { name: "Canal", value: `<#${event.channel_id}>`, inline: true },
      { name: "Host (organizador)", value: `<@${event.organizer_id}>`, inline: true },
      { name: "Finalizado por", value: `<@${finalizedByUserId}>`, inline: true },
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

  const sheetEmbed = new EmbedBuilder()
    .setTitle("Linha para a planilha")
    .setColor(0x57f287)
    .addFields(
      { name: "Dia", value: sheetRow.dia, inline: true },
      { name: "Dinâmica", value: sheetRow.dinamica, inline: true },
      { name: "Participantes únicos", value: sheetRow.participantesUnicos, inline: true },
      { name: "Total de mensagens", value: sheetRow.totalMensagens, inline: true },
      { name: "Host", value: sheetRow.host, inline: true },
      {
        name: "Copiar (tab)",
        value: `\`\`\`\n${formatSheetReportRowCopyPaste(sheetRow)}\n\`\`\``,
        inline: false,
      },
    );

  const instructions = new EmbedBuilder()
    .setTitle("Próximo passo: Report das dinâmicas")
    .setColor(0xfee75c)
    .setDescription(
      [
        "Envie o relatório desta dinâmica na planilha **Report das dinâmicas**:",
        reportUrl,
        "",
        "Use os valores acima nas colunas **Dia · Dinâmica · Participantes único · Total de Mensagens · Host**.",
        sheetsAutoSynced
          ? "_O bot já tentou acrescentar esta linha automaticamente na planilha (se configurado)._"
          : "_Preencha a planilha manualmente com os dados acima._",
      ].join("\n"),
    );

  const participants = new EmbedBuilder()
    .setTitle("Participantes")
    .setColor(0x2f3136)
    .addFields(
      { name: "Apenas botão", value: formatUserList(buckets.buttonOnly), inline: false },
      { name: "Apenas mensagens", value: formatUserList(buckets.messageOnly), inline: false },
      { name: "Botão e mensagens", value: formatUserList(buckets.both), inline: false },
    );

  return [summary, sheetEmbed, instructions, participants];
}

export async function sendStaffFinishDm(
  staff: User,
  guild: Guild,
  event: EventRow,
  stats: EventFinishStats,
  reportUrl: string,
  sheetsAutoSynced: boolean,
): Promise<boolean> {
  const hostLabel = await resolveMemberLabel(guild, event.organizer_id);
  const sheetRow = buildSheetReportRow(event, stats, hostLabel);
  const embeds = buildStaffFinishDmEmbeds(
    event,
    stats,
    sheetRow,
    reportUrl,
    staff.id,
    sheetsAutoSynced,
  );

  try {
    const dm = await staff.createDM();
    await dm.send({ embeds });
    return true;
  } catch {
    return false;
  }
}
