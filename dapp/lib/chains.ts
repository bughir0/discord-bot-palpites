import { defineChain } from "viem";

export const spicy = defineChain({
  id: 88882,
  name: "Chiliz Spicy Testnet",
  nativeCurrency: { name: "Chiliz", symbol: "CHZ", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://spicy-rpc.chiliz.com"],
      webSocket: ["wss://spicy-rpc-ws.chiliz.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Chiliscan Testnet",
      url: "https://testnet.chiliscan.com",
    },
  },
  testnet: true,
});

export const chiliz = defineChain({
  id: 88888,
  name: "Chiliz Chain",
  nativeCurrency: { name: "Chiliz", symbol: "CHZ", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.ankr.com/chiliz"],
    },
  },
  blockExplorers: {
    default: { name: "Chiliscan", url: "https://chiliscan.com" },
  },
});

export const ACTIVE_CHAIN =
  process.env.NEXT_PUBLIC_NETWORK === "chiliz" ? chiliz : spicy;
