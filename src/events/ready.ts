import { Events, type Client } from 'discord.js';
import { modules } from '../core/registry';
import { getApiUsageToday } from '../services/apiFutebol';
import {
  applyMaintenancePresence,
  isMaintenanceActive,
} from '../services/maintenanceMode';
import { log } from '../utils/logger';

export function registerReadyEvent(client: Client): void {
  client.once(Events.ClientReady, () => {
    const api = getApiUsageToday();
    const labels = modules.map((m) => m.id).join(', ');
    log.success(`Palpito online como ${client.user?.tag}`);
    log.info(`Módulos: ${labels}`);
    log.info(`API Futebol hoje: ${api.count}/${api.limit} requisições`);
    if (isMaintenanceActive()) {
      log.warn('Modo manutenção ATIVO — comandos e automações pausados.');
    }
    applyMaintenancePresence(client);
  });
}
