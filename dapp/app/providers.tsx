"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import {
  clearStaleWalletConnectStorage,
  walletConnectEnabled,
  wagmiConfig,
} from "@/lib/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

function useWalletConnectErrorGuard() {
  useEffect(() => {
    if (!walletConnectEnabled) {
      clearStaleWalletConnectStorage();
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = String(
        (event.reason as Error | undefined)?.message ?? event.reason ?? "",
      );
      if (
        message.includes("Connection interrupted") ||
        message.includes("WalletConnect")
      ) {
        event.preventDefault();
        console.warn("[wallet]", message);
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  useWalletConnectErrorGuard();

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#DC0728",
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
