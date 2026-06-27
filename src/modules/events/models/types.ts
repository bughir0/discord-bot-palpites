/** Estados do ciclo de vida do evento no banco */
export type EventStatus = "active" | "ended" | "cancelled";

/** Registro principal de um evento */
export interface EventRow {
  id: string;
  guild_id: string;
  name: string;
  description: string | null;
  organizer_id: string;
  channel_id: string;
  embed_message_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  planned_duration_seconds: number | null;
  actual_duration_seconds: number | null;
  status: EventStatus;
  created_at: Date;
  updated_at: Date;
}

/** Participante com métricas de botão e mensagens */
export interface ParticipantRow {
  id: string;
  event_id: string;
  user_id: string;
  clicked_button_at: Date | null;
  first_message_at: Date | null;
  last_message_at: Date | null;
  message_count: number;
  created_at: Date;
}

/** Snapshot persistido ao finalizar */
export interface EventSnapshotRow {
  event_id: string;
  count_button_only: number;
  count_message_only: number;
  count_both: number;
  total_messages: string;
  unique_participants: number;
  computed_at: Date;
}

/** Agregado mensal por servidor */
export interface MonthlyAggregateRow {
  id: string;
  guild_id: string;
  year: number;
  month: number;
  events_finished: number;
  total_participations: number;
  total_messages: string;
  updated_at: Date;
}

/** Categorização para embeds e exportação */
export interface ParticipationBuckets {
  buttonOnly: string[];
  messageOnly: string[];
  both: string[];
}

/** Estatísticas de um evento finalizado */
export interface EventFinishStats {
  snapshot: EventSnapshotRow;
  buckets: ParticipationBuckets;
  perUserMessages: { userId: string; count: number }[];
}
