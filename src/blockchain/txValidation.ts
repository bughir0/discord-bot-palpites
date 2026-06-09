import { ethers } from 'ethers';
import { env } from '../config';
import { getProvider } from './chiliz';

type ValidarTxTransferenciaArgs = {
  txHash: string;
  wallet: string;
  receiverAddress: string;
  valorEsperadoWei: string;
};

/**
 * Valida pagamento por transferencia simples (sem contrato).
 * Regras:
 * - tx existe, minerada e com sucesso;
 * - remetente == wallet informada;
 * - destino == endereco recebedor configurado;
 * - valor transferido == valor esperado;
 * - sem payload de chamada de contrato (data vazia).
 */
type TxSnapshot = {
  from: string;
  to: string | null;
  value: bigint;
  data: string;
  status: 0 | 1;
};

function parseStatus(value: unknown): 0 | 1 | null {
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  if (typeof value === 'bigint') return value === 1n ? 1 : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '1' || trimmed === '0x1' || trimmed === 'true') return 1;
    if (trimmed === '0' || trimmed === '0x0' || trimmed === 'false') return 0;
  }
  return null;
}

function parseBigIntUnknown(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? BigInt(value) : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed);
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  }
  return null;
}

function parseAddressUnknown(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ethers.isAddress(trimmed) ? trimmed.toLowerCase() : null;
}

function normalizeApiBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

function getScanApiBaseUrls(): string[] {
  const fromEnv = env.chilizScanApiBaseUrl?.trim();
  const defaults =
    env.chilizChainId === 88882
      ? [
          'https://scan-api.chiliz.com/api',
          'https://testnet.chiliscan.com/api',
          'https://api.routescan.io/v2/network/testnet/evm/88882/etherscan/api',
        ]
      : ['https://scan-api.chiliz.com/api', 'https://explorer.chiliz.com/api'];

  const urls = fromEnv ? [fromEnv, ...defaults] : defaults;
  return [...new Set(urls.map(normalizeApiBaseUrl))];
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8_000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchScanAction(baseUrl: string, action: string, txHash: string): Promise<unknown> {
  const url = new URL(baseUrl);
  url.searchParams.set('module', 'transaction');
  url.searchParams.set('action', action);
  url.searchParams.set('txhash', txHash);
  if (env.chilizScanApiKey) url.searchParams.set('apikey', env.chilizScanApiKey);

  const payload = await fetchJsonWithTimeout(url.toString());
  if (typeof payload === 'object' && payload !== null && 'result' in payload) {
    return (payload as { result: unknown }).result;
  }
  return null;
}

function parseStatusFromScan(txInfo: unknown, txReceipt: unknown): 0 | 1 | null {
  const direct = parseStatus(txReceipt);
  if (direct != null) return direct;

  if (typeof txReceipt === 'object' && txReceipt !== null) {
    const receiptObj = txReceipt as Record<string, unknown>;
    const s1 = parseStatus(receiptObj.status);
    if (s1 != null) return s1;
    const s2 = parseStatus(receiptObj.txreceipt_status);
    if (s2 != null) return s2;
    const isError = parseStatus(receiptObj.isError);
    if (isError != null) return isError === 1 ? 0 : 1;
  }

  if (typeof txInfo === 'object' && txInfo !== null) {
    const infoObj = txInfo as Record<string, unknown>;
    const s1 = parseStatus(infoObj.status);
    if (s1 != null) return s1;
    const s2 = parseStatus(infoObj.txreceipt_status);
    if (s2 != null) return s2;
    const isError = parseStatus(infoObj.isError);
    if (isError != null) return isError === 1 ? 0 : 1;
  }

  return null;
}

function parseTxFromScan(txInfo: unknown, txReceipt: unknown): TxSnapshot | null {
  if (typeof txInfo !== 'object' || txInfo === null) return null;
  const infoObj = txInfo as Record<string, unknown>;

  const from = parseAddressUnknown(infoObj.from);
  const to = parseAddressUnknown(infoObj.to);
  const value = parseBigIntUnknown(infoObj.value);
  const dataRaw =
    typeof infoObj.input === 'string'
      ? infoObj.input
      : typeof infoObj.data === 'string'
        ? infoObj.data
        : '0x';
  const data = dataRaw.startsWith('0x') ? dataRaw : `0x${dataRaw}`;
  const status = parseStatusFromScan(txInfo, txReceipt);

  if (!from || value == null || status == null) return null;
  return { from, to, value, data, status };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getTxSnapshotViaScanApi(txHash: string): Promise<TxSnapshot | null> {
  for (const base of getScanApiBaseUrls()) {
    try {
      const [txInfo, txReceipt] = await Promise.all([
        fetchScanAction(base, 'gettxinfo', txHash),
        fetchScanAction(base, 'gettxreceipt', txHash),
      ]);
      const parsed = parseTxFromScan(txInfo, txReceipt);
      if (parsed) return parsed;
    } catch {
      // tenta proximo endpoint
    }
  }
  return null;
}

async function getTxSnapshot(txHash: string): Promise<TxSnapshot> {
  const provider = getProvider();

  try {
    const [tx, receipt] = await withTimeout(
      Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash),
      ]),
      8_000,
      'Timeout ao consultar RPC da Chiliz.',
    );

    if (tx && receipt) {
      return {
        from: tx.from.toLowerCase(),
        to: tx.to?.toLowerCase() ?? null,
        value: tx.value,
        data: tx.data,
        status: receipt.status === 1 ? 1 : 0,
      };
    }
  } catch {
    // fallback para API scan
  }

  const fromScan = await getTxSnapshotViaScanApi(txHash);
  if (fromScan) return fromScan;

  throw new Error('Transacao ainda nao foi encontrada/minerada na chain.');
}

export async function validarTxTransferenciaNaChain(
  args: ValidarTxTransferenciaArgs,
): Promise<void> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(args.txHash)) {
    throw new Error('Tx hash invalido.');
  }
  if (!ethers.isAddress(args.wallet)) {
    throw new Error('Endereco de wallet invalido.');
  }
  if (!ethers.isAddress(args.receiverAddress)) {
    throw new Error('Endereco recebedor invalido no servidor.');
  }

  const wallet = args.wallet.toLowerCase();
  const receiver = args.receiverAddress.toLowerCase();
  const valorEsperado = BigInt(args.valorEsperadoWei);

  const snapshot = await getTxSnapshot(args.txHash);
  if (snapshot.status !== 1) {
    throw new Error('Transacao falhou na chain (status revertido).');
  }
  if (snapshot.from !== wallet) {
    throw new Error('Wallet informada nao corresponde ao remetente da transacao.');
  }
  if (!snapshot.to || snapshot.to !== receiver) {
    throw new Error('Transacao nao foi enviada para o endereco recebedor configurado.');
  }
  if (snapshot.value !== valorEsperado) {
    throw new Error('Valor transferido diferente do esperado para a rodada.');
  }
  if (snapshot.data && snapshot.data !== '0x') {
    throw new Error(
      'Transacao contem payload de contrato; esperado transferencia simples de CHZ.',
    );
  }
}
