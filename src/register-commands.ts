import { REST, Routes } from 'discord.js';
import { env } from './config';
import { allCommands } from './core/registry';
import { log } from './utils/logger';

/**
 * Registra os slash commands.
 *
 * Por padrão registra GLOBALMENTE (disponível em todos os servidores; o Discord
 * pode levar até 1h para propagar). Se quiser registro instantâneo só na guild
 * de teste, rode com `--guild` (usa DISCORD_GUILD_ID).
 */
async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(env.discordToken);
  const body = allCommands().map((cmd) => cmd.data.toJSON());

  const guildOnly = process.argv.includes('--guild');

  log.info(`Registrando ${body.length} comandos...`);

  if (guildOnly) {
    if (!env.discordGuildId) {
      log.error('--guild informado mas DISCORD_GUILD_ID está vazio no .env.');
      process.exit(1);
    }
    await rest.put(Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId), {
      body,
    });
    log.success(`Comandos registrados (instantâneo) na guild ${env.discordGuildId}`);
    return;
  }

  await rest.put(Routes.applicationCommands(env.discordClientId), { body });
  log.success('Comandos registrados GLOBALMENTE (propagação pode levar até 1h).');

  // Limpa comandos antigos da guild para não aparecerem duplicados ao lado dos globais.
  if (env.discordGuildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(env.discordClientId, env.discordGuildId), {
        body: [],
      });
      log.detail(`Comandos da guild ${env.discordGuildId} limpos (evita duplicatas).`);
    } catch (err) {
      log.warn('Não foi possível limpar comandos da guild (siga normalmente).');
      log.error('Detalhe:', err);
    }
  }
}

registerCommands().catch((error) => {
  log.error('Erro ao registrar comandos:', error);
  process.exit(1);
});
