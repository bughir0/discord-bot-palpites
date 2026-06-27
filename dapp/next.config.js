const path = require("path");
const { config: loadEnv } = require("dotenv");

// Um único .env na raiz do monorepo (bot + dApp)
loadEnv({ path: path.join(__dirname, "..", ".env") });

const optionalStub = path.join(__dirname, "lib/stubs/empty.js");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/aposta/:path*",
        destination: "/bolao/:path*",
        permanent: false,
      },
      {
        source: "/quiz-panel",
        destination: "/quiz",
        permanent: false,
      },
      {
        source: "/quiz-panel/:path*",
        destination: "/quiz",
        permanent: false,
      },
    ];
  },
  webpack: (config) => {
    // cuer@0.0.3 (RainbowKit) usa border:0; qr@0.6+ lança "invalid border=0"
    config.resolve.alias = {
      ...config.resolve.alias,
      qr: path.dirname(require.resolve("qr")),
      "@react-native-async-storage/async-storage": optionalStub,
      "pino-pretty": optionalStub,
    };

    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": optionalStub,
      "pino-pretty": optionalStub,
    };

    return config;
  },
};

module.exports = nextConfig;
