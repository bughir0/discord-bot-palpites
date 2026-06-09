import type { ReactNode } from "react";

type SiteMainProps = {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
};

export function SiteMain({
  children,
  className = "",
  narrow = false,
}: SiteMainProps) {
  return (
    <main
      className={`relative z-10 mx-auto px-4 py-8 sm:px-6 lg:px-8 ${
        narrow ? "max-w-2xl" : "max-w-6xl"
      } ${className}`}
    >
      {children}
    </main>
  );
}
