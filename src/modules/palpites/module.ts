import type { Interaction } from 'discord.js';
import type { BotModule } from '../../core/types';
import {
  commands,
  handleButton,
  handleModal,
  handleSelectMenu,
} from '../../commands';

const PALPITE_ACTIONS = new Set([
  'palpitar',
  'select-partida',
  'modal-palpite',
  'meus-palpites',
  'ver-acertos',
  'ranking-rodada',
  'ranking-mais',
  'bolao-chz',
  'apostar-chz',
  'bolao-chz-pagar',
  'select-bolao-chz',
  'modal-bolao-chz',
]);

function isPalpitesInteraction(interaction: Interaction): boolean {
  if (interaction.isChatInputCommand()) {
    return commands.some((c) => c.data.name === interaction.commandName);
  }
  if ('customId' in interaction && typeof interaction.customId === 'string') {
    const action = interaction.customId.split(':')[0];
    return PALPITE_ACTIONS.has(action);
  }
  return false;
}

export const palpitesModule: BotModule = {
  id: 'palpites',
  label: 'Palpites Brasileirão / Copa CHZ',
  commands,
  handleInteraction: async (interaction) => {
    if (!isPalpitesInteraction(interaction)) return false;
    if (interaction.isButton()) {
      await handleButton(interaction);
      return true;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return true;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return true;
    }
    return false;
  },
};
