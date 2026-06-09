import { REST, Routes } from 'discord.js';
import { env } from './config';
import { commands } from './commands';
import { log } from './utils/logger';

async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(env.discordToken);
  const body = commands.map((cmd) => cmd.data.toJSON());

  log.info(`Registrando ${body.length} comandos...`);

  if (env.discordGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId), {
      body,
    });
    log.success(`Comandos registrados no servidor ${env.discordGuildId}`);
  } else {
    await rest.put(Routes.applicationCommands(env.discordClientId), { body });
    log.success('Comandos registrados globalmente (pode levar até 1h)');
  }
}

registerCommands().catch((error) => {
  log.error('Erro ao registrar comandos:', error);
  process.exit(1);
});
