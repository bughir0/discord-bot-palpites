import type { ReactNode } from "react";
import { Web3Providers } from "@/components/Web3Providers";

export default function PalpitesLayout({ children }: { children: ReactNode }) {
  return <Web3Providers>{children}</Web3Providers>;
}
