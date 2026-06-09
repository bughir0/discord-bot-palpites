import { ActivityType, Events, type Client } from 'discord.js';
import { LEAGUE } from '../embeds/theme';
import { getApiUsageToday } from '../services/apiFutebol';
import { log } from '../utils/logger';

export function registerReadyEvent(client: Client): void {
  client.once(Events.ClientReady, () => {
    const api = getApiUsageToday();
    log.success(`Bot online como ${client.user?.tag}`);
    log.info(`${LEAGUE.label} — Bot de Palpites`);
    log.info(`API Futebol hoje: ${api.count}/${api.limit} requisições`);
    client.user?.setActivity('⚽ /proximos-jogos', { type: ActivityType.Watching });
  });
}
