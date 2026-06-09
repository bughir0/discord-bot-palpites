import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config';
import { log } from '../utils/logger';

let dappProcess: ChildProcess | null = null;

function isLocalDappUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

function dappPortFromUrl(url: string): number {
  try {
    const parsed = new URL(url);
    if (parsed.port) return Number(parsed.port);
    return 3000;
  } catch {
    return 3000;
  }
}

export function shouldAutoStartDapp(): boolean {
  const raw = process.env.DAPP_AUTO_START?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  return isLocalDappUrl(env.dappBaseUrl);
}

export function startDapp(): void {
  if (!shouldAutoStartDapp()) {
    log.info(
      `dApp não iniciado automaticamente (DAPP_BASE_URL=${env.dappBaseUrl}). ` +
        'Use DAPP_AUTO_START=true ou aponte DAPP_BASE_URL para localhost.',
    );
    return;
  }

  if (dappProcess) return;

  const dappDir = path.join(process.cwd(), 'dapp');
  const pkgPath = path.join(dappDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    log.warn('Pasta dapp/ não encontrada — mini-site não será iniciado.');
    return;
  }

  if (!fs.existsSync(path.join(dappDir, 'node_modules'))) {
    log.warn(
      'dapp/node_modules ausente. Rode `cd dapp && npm install` antes de iniciar o bot.',
    );
    return;
  }

  const port = dappPortFromUrl(env.dappBaseUrl);
  const isProd = process.env.NODE_ENV === 'production';
  const npmScript = isProd ? 'start' : 'dev';

  if (isProd && !fs.existsSync(path.join(dappDir, '.next'))) {
    log.warn('dapp/.next ausente. Rode `cd dapp && npm run build` para produção.');
    return;
  }

  log.info(`Iniciando mini dApp (npm run ${npmScript}) em ${env.dappBaseUrl}…`);

  dappProcess = spawn('npm', ['run', npmScript], {
    cwd: dappDir,
    shell: true,
    env: {
      ...process.env,
      PORT: String(port),
      NEXT_PUBLIC_APP_URL: env.dappBaseUrl,
      BOT_API_URL: `http://localhost:${env.botApiPort}`,
      NEXT_PUBLIC_BOT_API_URL: `http://localhost:${env.botApiPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  dappProcess.stdout?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      log.info(`[dapp] ${line}`);
    }
  });

  dappProcess.stderr?.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
      log.warn(`[dapp] ${line}`);
    }
  });

  dappProcess.on('exit', (code, signal) => {
    if (dappProcess) {
      log.warn(`dApp encerrou (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`);
      dappProcess = null;
    }
  });
}

export function stopDapp(): void {
  if (!dappProcess?.pid) return;

  const pid = dappProcess.pid;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { shell: true, stdio: 'ignore' });
  } else {
    dappProcess.kill('SIGTERM');
  }
  dappProcess = null;
  log.info('dApp encerrado.');
}
