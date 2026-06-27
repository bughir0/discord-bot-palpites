import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  Interaction,
  Message,
} from 'discord.js';
import type { FastifyInstance } from 'fastify';
import type { BotCommand } from '../bot/types';

export interface BotModule {
  /** Identificador interno (ex.: palpites, points, events) */
  id: string;
  /** Nome legível para logs */
  label: string;
  commands: BotCommand[];
  /** Retorna true se tratou a interação (botão, modal, select, autocomplete) */
  handleInteraction?: (interaction: Interaction) => Promise<boolean>;
  onReady?: (client: Client) => void | Promise<void>;
  onMessage?: (message: Message) => void | Promise<void>;
  registerHttpRoutes?: (server: FastifyInstance) => void | Promise<void>;
  registerJobs?: (client: Client) => void;
}

export type ModuleCommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;
export type ModuleAutocompleteHandler = (interaction: AutocompleteInteraction) => Promise<void>;
