import type { Metadata } from "next";
import "./globals.css";
import { SiteBackground } from "@/components/SiteBackground";

export const metadata: Metadata = {
  title: "Palpito",
  description: "Palpites da Copa, quiz e eventos — Discord + web",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <SiteBackground />
        <div className="relative min-h-screen">{children}</div>
      </body>
    </html>
  );
}
