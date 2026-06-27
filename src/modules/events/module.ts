import type { Interaction, Message } from 'discord.js';
import type { BotModule } from '../../core/types';
import type { BotCommand } from '../../bot/types';
import { log } from '../../utils/logger';
import { BotContext } from './context';
import { pool, runMigrations } from './database/pool';
import { buildEventoSlashCommand } from './commands/registerCommands';
import { handleEventoCommand } from './commands/eventoCommand';
import { handleEventoAutocomplete } from './commands/eventoAutocomplete';
import { createInteractionCreateListener } from './listeners/interactionCreate';
import { createMessageCreateListener } from './listeners/messageCreate';

let eventsCtx: BotContext | null = null;

const eventoCommand: BotCommand = {
  data: buildEventoSlashCommand(),
  execute: async (interaction) => {
    if (!eventsCtx) throw new Error('Módulo de eventos não inicializado');
    await handleEventoCommand(interaction, eventsCtx);
  },
};

export const eventsModule: BotModule = {
  id: 'events',
  label: 'Eventos',
  commands: [eventoCommand],
  onReady: async (client) => {
    await runMigrations();
    eventsCtx = new BotContext(client, pool as never);
    try {
      const n = await eventsCtx.eventService.warmActiveEventCache();
      log.info(`[events] ${n} evento(s) ativo(s) em cache`);
    } catch (e) {
      log.error('[events] Falha ao carregar cache:', e);
    }
  },
  handleInteraction: async (interaction: Interaction) => {
    if (!eventsCtx) return false;
    if (interaction.isAutocomplete() && interaction.commandName === 'evento') {
      await handleEventoAutocomplete(interaction, eventsCtx);
      return true;
    }
    if (
      interaction.isButton() &&
      (interaction.customId.startsWith('evt:participate:') ||
        interaction.customId === 'evt:purge:confirm' ||
        interaction.customId === 'evt:purge:cancel')
    ) {
      await createInteractionCreateListener(eventsCtx)(interaction);
      return true;
    }
    return false;
  },
  onMessage: async (message: Message) => {
    if (!eventsCtx) return;
    await createMessageCreateListener(eventsCtx)(message);
  },
};
