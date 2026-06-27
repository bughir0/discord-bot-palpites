/**
 * Config do módulo de eventos — lê do .env unificado do Palpito.
 */
function parseIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export const eventsEnv = {
  staffRoleIds: parseIdList(process.env.STAFF_ROLE_IDS),
  adminRoleIds: parseIdList(process.env.ADMIN_ROLE_IDS),
  adminLogChannelId: process.env.ADMIN_LOG_CHANNEL_ID?.trim() || process.env.CO_LOG_CHANNEL_ID?.trim() || '',
  googleSheetsWebhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim() || '',
  googleSheetsWebhookSecret: process.env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim() || '',
  googleSheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || '',
  googleSheetsTabName: process.env.GOOGLE_SHEETS_TAB_NAME?.trim() || 'Eventos',
  googleServiceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim() || '',
  /** Planilha "Report das dinâmicas" — link enviado ao staff na DM ao finalizar. */
  googleSheetsReportUrl:
    process.env.GOOGLE_SHEETS_REPORT_URL?.trim() ||
    'https://docs.google.com/spreadsheets/d/1ppdfq5lIUAqx3N6YTjIgUFaocC34tqx0HJRZjipqV5w/edit?usp=sharing',
};

/** Alias para código legado de eventos */
export const env = eventsEnv;
