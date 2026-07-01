import { createClient } from './bot/client';
import { bootstrapModules, registerModuleJobs } from './core/bootstrap';
import { modules } from './core/registry';
import { env, onchainEnabled } from './config';
import { getDb, closeDb } from './db/database';
import { registerReadyEvent } from './events/ready';
import { registerMessageEvent } from './events/messageCreate';
import { registerInteractionEvent } from './events/interactionCreate';
import { startAbrirRodadaJob } from './jobs/abrirRodada';
import { startResultadosJob } from './jobs/verificarResultados';
import { checarConexao } from './blockchain/chiliz';
import { startHttpServer, stopHttpServer } from './http/server';
import { startDapp, stopDapp } from './services/dappLauncher';
import { log, initLogger } from './utils/logger';

async function main(): Promise<void> {
  initLogger();
  getDb();

  const client = createClient();
  registerReadyEvent(client);
  registerInteractionEvent(client);
  registerMessageEvent(client);
  startResultadosJob(client);
  startAbrirRodadaJob(client);
  registerModuleJobs(client);

  if (onchainEnabled) {
    log.info('Modo on-chain HABILITADO (Copa CHZ).');
    const status = await checarConexao();
    if (status) {
      log.info(`Chiliz Chain conectada (chainId=${status.chainId}).`);
      log.info('Modo pagamento sem contrato ATIVO (validacao por tx na blockchain).');
    } else {
      log.warn('Falha ao conectar na Chiliz Chain — comandos on-chain podem nao funcionar.');
    }
  } else {
    log.info(
      'Modo on-chain DESABILITADO (so Brasileirao free). Defina CHILIZ_PAYMENT_RECEIVER_ADDRESS para ativar CHZ.',
    );
  }

  await startHttpServer();
  await startDapp();

  await bootstrapModules(client);

  const shutdown = async (): Promise<void> => {
    log.info('Encerrando bot…');
    stopDapp();
    await stopHttpServer();
    closeDb();
    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });

  await client.login(env.discordToken);
}

main().catch((error) => {
  log.error('Falha ao iniciar bot:', error);
  process.exit(1);
});
