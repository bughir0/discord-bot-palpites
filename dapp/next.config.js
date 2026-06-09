const path = require("path");

const optionalStub = path.join(__dirname, "lib/stubs/empty.js");

const botApiUrl =
  process.env.BOT_API_URL ??
  process.env.NEXT_PUBLIC_BOT_API_URL ??
  "http://localhost:3001";

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
    ];
  },
  async rewrites() {
    return [
      {
        source: "/bot-api/:path*",
        destination: `${botApiUrl}/:path*`,
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
