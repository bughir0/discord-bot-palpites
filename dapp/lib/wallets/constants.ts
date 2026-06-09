/** Project ID de desenvolvimento do RainbowKit (relay publico). */
export const RAINBOWKIT_DEV_PROJECT_ID = "21fef48091f12692cad574a6f7753643";

/** ID oficial da Socios.com Wallet no ecossistema WalletConnect/Reown. */
export const SOCIOS_WALLET_ID =
  "56843177b5e89d4bcb19a27dab7c49e0f33d8d3a6c8c4c7e5274f605e92befd6";

const walletConnectProjectIdRaw =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

export const hasOwnWalletConnectProjectId =
  walletConnectProjectIdRaw.length > 0 &&
  walletConnectProjectIdRaw !== "REPLACE_ME";

/** Sempre retorna um projectId valido para o relay do WalletConnect. */
export const walletConnectProjectId = hasOwnWalletConnectProjectId
  ? walletConnectProjectIdRaw
  : RAINBOWKIT_DEV_PROJECT_ID;
