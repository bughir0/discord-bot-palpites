import { JsonRpcProvider } from 'ethers';
import { env, onchainEnabled } from '../config';
import { log } from '../utils/logger';

let providerSingleton: JsonRpcProvider | null = null;

export function getProvider(): JsonRpcProvider {
  if (providerSingleton) return providerSingleton;
  providerSingleton = new JsonRpcProvider(env.chilizRpcUrl, env.chilizChainId, {
    staticNetwork: true,
  });
  return providerSingleton;
}

export function explorerTxUrl(txHash: string): string {
  const base =
    env.chilizChainId === 88888
      ? 'https://chiliscan.com'
      : 'https://testnet.chiliscan.com';
  return `${base}/tx/${txHash}`;
}

export function explorerAddrUrl(address: string): string {
  const base =
    env.chilizChainId === 88888
      ? 'https://chiliscan.com'
      : 'https://testnet.chiliscan.com';
  return `${base}/address/${address}`;
}

export async function checarConexao(): Promise<{
  chainId: number;
} | null> {
  if (!onchainEnabled) return null;
  try {
    const provider = getProvider();
    const net = await provider.getNetwork();
    return { chainId: Number(net.chainId) };
  } catch (err) {
    log.error('Falha ao conectar na Chiliz Chain:', err);
    return null;
  }
}
