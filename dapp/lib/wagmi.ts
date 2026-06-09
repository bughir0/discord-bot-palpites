import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { ACTIVE_CHAIN } from "./chains";
import {
  hasOwnWalletConnectProjectId,
  walletConnectParameters,
  walletConnectProjectId,
  walletGroups,
} from "./wallets";

export { hasOwnWalletConnectProjectId as walletConnectEnabled } from "./wallets";

export const wagmiConfig = getDefaultConfig({
  appName: "Palpiter CHZ",
  appDescription: "Palpites da Copa do Mundo na Chiliz Chain",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  projectId: walletConnectProjectId,
  chains: [ACTIVE_CHAIN],
  wallets: walletGroups,
  walletConnectParameters,
  ssr: true,
});

/** Remove sessoes WalletConnect antigas que disparam reconnect com relay invalido. */
export function clearStaleWalletConnectStorage() {
  if (typeof window === "undefined") return;
  for (const key of Object.keys(localStorage)) {
    if (
      key.startsWith("wc@2:") ||
      key.startsWith("@w3m/") ||
      key.includes("walletconnect")
    ) {
      localStorage.removeItem(key);
    }
  }
}
