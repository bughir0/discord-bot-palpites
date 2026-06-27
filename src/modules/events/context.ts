import type { Client } from "discord.js";
import type { DbQueryable as Pool } from '../../db/sqlite-pool';
import { EventService } from "./services/event.service";
import { ExportService } from "./services/export.service";
import { LoggerService } from "./services/logger.service";
import { ReportService } from "./services/report.service";

/** Serviços compartilhados (injção manual para manter simplicidade sem framework DI). */
export class BotContext {
  readonly eventService: EventService;
  readonly reportService: ReportService;
  readonly exportService: ExportService;
  readonly logger: LoggerService;

  constructor(
    readonly client: Client,
    readonly pool: Pool,
  ) {
    this.eventService = new EventService(pool);
    this.reportService = new ReportService(pool);
    this.exportService = new ExportService(pool);
    this.logger = new LoggerService(client, pool);
  }
}
