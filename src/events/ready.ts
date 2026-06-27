import { ActivityType, Events, type Client } from 'discord.js';
import { modules } from '../core/registry';
import { getApiUsageToday } from '../services/apiFutebol';
import { log } from '../utils/logger';

export function registerReadyEvent(client: Client): void {
  client.once(Events.ClientReady, () => {
    const api = getApiUsageToday();
    const labels = modules.map((m) => m.id).join(', ');
    log.success(`Palpito online como ${client.user?.tag}`);
    log.info(`Módulos: ${labels}`);
    log.info(`API Futebol hoje: ${api.count}/${api.limit} requisições`);
    client.user?.setActivity('Palpito | /quiz /evento', { type: ActivityType.Watching });
  });
}
