import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from '../config';
import { log } from '../utils/logger';
import { registerSessionRoutes } from './routes/sessions';
import { registerWalletRoutes } from './routes/wallet';
import { registerRodadaRoutes } from './routes/rodadas';
import { registerSiteRoutes } from './routes/site';

let serverSingleton: FastifyInstance | null = null;

export async function startHttpServer(): Promise<FastifyInstance | null> {
  if (serverSingleton) return serverSingleton;

  const fastify = Fastify({ logger: false });

  const origin =
    env.botApiCorsOrigin ??
    [env.dappBaseUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(
      Boolean,
    );
  await fastify.register(cors, { origin: origin.length ? origin : true });

  fastify.get('/healthz', async () => ({ ok: true, ts: Date.now() }));

  registerSessionRoutes(fastify);
  registerWalletRoutes(fastify);
  registerRodadaRoutes(fastify);
  registerSiteRoutes(fastify);

  try {
    const address = await fastify.listen({ port: env.botApiPort, host: '0.0.0.0' });
    log.info(`HTTP server interno ativo em ${address} (CORS: ${origin})`);
    serverSingleton = fastify;
    return fastify;
  } catch (err) {
    log.error('Falha ao iniciar HTTP server:', err);
    return null;
  }
}

export async function stopHttpServer(): Promise<void> {
  if (serverSingleton) {
    await serverSingleton.close();
    serverSingleton = null;
  }
}
