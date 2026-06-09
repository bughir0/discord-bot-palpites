import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { commands } from '../commands';

export function createClient(): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  });

  client.commands = new Collection();
  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }

  return client;
}
