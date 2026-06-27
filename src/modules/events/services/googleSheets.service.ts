import { readFileSync } from "node:fs";
import type { Guild } from "discord.js";
import { google } from "googleapis";
import { env } from "../config/env";
import type { EventFinishStats, EventRow } from "../models/types";
import { resolveMemberLabel } from "../utils/memberLabel";
import { buildSheetReportRow, sheetReportRowToValues } from "../utils/sheetReportRow";

type ServiceAccountJson = {
  client_email: string;
  private_key: string;
};

/**
 * Acrescenta uma linha ao finalizar um evento (opcional).
 *
 * - **Webhook** (`GOOGLE_SHEETS_WEBHOOK_URL`): Apps Script na planilha — sem Google Cloud.
 * - **API** (`GOOGLE_SHEETS_SPREADSHEET_ID` + JSON): conta de serviço (Google Cloud).
 *
 * Se ambos estiverem definidos, usa-se primeiro o webhook.
 */
export class GoogleSheetsService {
  private auth: InstanceType<typeof google.auth.JWT> | null = null;

  isEnabled(): boolean {
    return Boolean(
      env.googleSheetsWebhookUrl ||
      (env.googleSheetsSpreadsheetId && env.googleServiceAccountKeyPath),
    );
  }

  private loadCredentials(): ServiceAccountJson {
    const raw = readFileSync(env.googleServiceAccountKeyPath, "utf-8");
    return JSON.parse(raw) as ServiceAccountJson;
  }

  private async getSheetsClient() {
    if (!this.auth) {
      const creds = this.loadCredentials();
      this.auth = new google.auth.JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
      await this.auth.authorize();
    }
    return google.sheets({ version: "v4", auth: this.auth });
  }

  private async buildRow(
    guild: Guild,
    event: EventRow,
    stats: EventFinishStats,
  ): Promise<string[]> {
    const host = await resolveMemberLabel(guild, event.organizer_id);
    return sheetReportRowToValues(buildSheetReportRow(event, stats, host));
  }

  private async appendViaWebhook(row: string[]): Promise<void> {
    const url = env.googleSheetsWebhookUrl;
    const body: { secret?: string; row: string[] } = { row };
    if (env.googleSheetsWebhookSecret) {
      body.secret = env.googleSheetsWebhookSecret;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Webhook HTTP ${res.status}: ${t.slice(0, 240)}`);
    }
  }

  private async appendViaSheetsApi(row: string[]): Promise<void> {
    const sheets = await this.getSheetsClient();
    const tab = env.googleSheetsTabName.replace(/'/g, "''");
    const range = `'${tab}'!A:E`;

    await sheets.spreadsheets.values.append({
      spreadsheetId: env.googleSheetsSpreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  }

  async appendFinishedEventRow(guild: Guild, event: EventRow, stats: EventFinishStats): Promise<void> {
    if (!this.isEnabled()) return;

    const row = await this.buildRow(guild, event, stats);

    if (env.googleSheetsWebhookUrl) {
      await this.appendViaWebhook(row);
      return;
    }

    if (env.googleSheetsSpreadsheetId && env.googleServiceAccountKeyPath) {
      await this.appendViaSheetsApi(row);
    }
  }
}
