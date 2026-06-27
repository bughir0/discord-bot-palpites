import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { allCommands } from '../core/registry';

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
  });

  client.commands = new Collection();
  for (const command of allCommands()) {
    client.commands.set(command.data.name, command);
  }

  return client;
}
