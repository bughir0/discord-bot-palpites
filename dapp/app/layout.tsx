import type { Metadata } from "next";
import "./globals.css";
import { SiteBackground } from "@/components/SiteBackground";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Palpiter CHZ",
  description: "Palpiter CHZ para palpites da Copa do Mundo 2026",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>
          <SiteBackground />
          <div className="relative min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
