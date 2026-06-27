import type { Client } from 'discord.js';
import { modules } from '../core/registry';
import { log } from '../utils/logger';

export async function bootstrapModules(client: Client): Promise<void> {
  for (const mod of modules) {
    if (mod.onReady) {
      await mod.onReady(client);
      log.info(`[palpito] Módulo "${mod.label}" pronto`);
    }
  }
}

export function registerModuleJobs(client: Client): void {
  for (const mod of modules) {
    mod.registerJobs?.(client);
  }
}
