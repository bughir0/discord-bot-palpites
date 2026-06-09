import {
  getWalletConnectConnector,
  type RainbowKitWalletConnectParameters,
  type Wallet,
} from "@rainbow-me/rainbowkit";

const SOCIOS_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3E%3Crect width='28' height='28' rx='6' fill='%23DC0728'/%3E%3Ctext x='14' y='19' text-anchor='middle' fill='white' font-size='13' font-weight='bold' font-family='Arial,sans-serif'%3ES%3C/text%3E%3C/svg%3E";

/** Carteira oficial Chiliz/Socios via WalletConnect (mobile + QR). */
export const sociosWallet = ({
  projectId,
  walletConnectParameters,
}: {
  projectId: string;
  walletConnectParameters?: RainbowKitWalletConnectParameters;
}): Wallet => ({
  id: "socios",
  name: "Socios.com",
  iconUrl: async () => SOCIOS_ICON,
  iconAccent: "#DC0728",
  iconBackground: "#1a1a1a",
  downloadUrls: {
    android:
      "https://play.google.com/store/apps/details?id=com.socios.socios",
    ios: "https://apps.apple.com/app/socios-com/id1459365745",
    mobile: "https://www.socios.com/",
    qrCode: "https://www.socios.com/",
  },
  mobile: {
    getUri: (uri) => `socios://wc?uri=${encodeURIComponent(uri)}`,
  },
  qrCode: {
    getUri: (uri) => uri,
    instructions: {
      learnMoreUrl: "https://www.socios.com/",
      steps: [
        {
          step: "install",
          title: "Instale o app Socios.com",
          description: "Baixe a carteira Socios.com na App Store ou Google Play.",
        },
        {
          step: "create",
          title: "Abra a carteira",
          description: "Entre na sua conta Socios.com no celular.",
        },
        {
          step: "scan",
          title: "Escaneie o QR code",
          description: "Use o leitor WalletConnect dentro do app Socios.com.",
        },
      ],
    },
  },
  createConnector: getWalletConnectConnector({
    projectId,
    walletConnectParameters,
  }),
});
