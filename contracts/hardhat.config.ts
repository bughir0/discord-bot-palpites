import path from "node:path";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

// Um unico .env na raiz do repo (mesmo do bot). Nao use contracts/.env.
const rootEnv = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: rootEnv });

const OWNER_KEY = process.env.CHILIZ_OWNER_PRIVATE_KEY?.trim();
const ownerKeyValida = OWNER_KEY ? /^0x[0-9a-fA-F]{64}$/.test(OWNER_KEY) : false;
const accounts = ownerKeyValida ? [OWNER_KEY] : [];

const spicyRpc =
  process.env.CHILIZ_SPICY_RPC_URL ??
  process.env.CHILIZ_RPC_URL ??
  "https://spicy-rpc.chiliz.com/";
const mainnetRpc =
  process.env.CHILIZ_MAINNET_RPC_URL ?? "https://rpc.ankr.com/chiliz";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "shanghai",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    spicy: {
      url: spicyRpc,
      chainId: 88882,
      accounts,
    },
    chiliz: {
      url: mainnetRpc,
      chainId: 88888,
      accounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 60_000,
  },
};

export default config;
