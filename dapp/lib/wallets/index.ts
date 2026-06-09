import type {
  RainbowKitWalletConnectParameters,
  WalletList,
} from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { SOCIOS_WALLET_ID } from "./constants";
import { sociosWallet } from "./sociosWallet";

export { hasOwnWalletConnectProjectId, walletConnectProjectId } from "./constants";

/** Grupos exibidos no modal "Connect a Wallet" do RainbowKit. */
export const walletGroups: WalletList = [
  {
    groupName: "Chiliz & mobile",
    wallets: [sociosWallet, trustWallet, walletConnectWallet],
  },
  {
    groupName: "Populares",
    wallets: [metaMaskWallet, coinbaseWallet, rainbowWallet, rabbyWallet],
  },
  {
    groupName: "Outras",
    wallets: [phantomWallet, okxWallet, braveWallet, injectedWallet],
  },
];

/** Parametros globais do WalletConnect (destaca Socios no explorer). */
export const walletConnectParameters = {
  explorerRecommendedWalletIds: [SOCIOS_WALLET_ID],
} as RainbowKitWalletConnectParameters;
