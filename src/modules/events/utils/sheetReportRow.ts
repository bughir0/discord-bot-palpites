import type { EventFinishStats, EventRow } from "../models/types";
import { eventBaseNameForSheet, formatEventDateOnlyPtBr } from "./eventDate";

export interface SheetReportRow {
  dia: string;
  dinamica: string;
  participantesUnicos: string;
  totalMensagens: string;
  host: string;
}

export function buildSheetReportRow(
  event: EventRow,
  stats: EventFinishStats,
  hostLabel: string,
): SheetReportRow {
  return {
    dia: formatEventDateOnlyPtBr(event.started_at),
    dinamica: eventBaseNameForSheet(event.name),
    participantesUnicos: String(stats.snapshot.unique_participants),
    totalMensagens: String(stats.snapshot.total_messages),
    host: hostLabel,
  };
}

export function sheetReportRowToValues(row: SheetReportRow): string[] {
  return [row.dia, row.dinamica, row.participantesUnicos, row.totalMensagens, row.host];
}

export function formatSheetReportRowCopyPaste(row: SheetReportRow): string {
  return sheetReportRowToValues(row).join("\t");
}
