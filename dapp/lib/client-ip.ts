/** Normaliza IPs de loopback (::1, 127.0.0.1) para exibição consistente. */
export function normalizeClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;

  if (
    trimmed === "::1" ||
    trimmed === "127.0.0.1" ||
    trimmed === "localhost" ||
    trimmed === "0:0:0:0:0:0:0:1"
  ) {
    return "127.0.0.1 (localhost)";
  }

  if (trimmed.startsWith("::ffff:")) {
    const v4 = trimmed.slice(7);
    if (v4 === "127.0.0.1") return "127.0.0.1 (localhost)";
    return v4;
  }

  return trimmed;
}

export function clientIpFromRequest(req: {
  headers: { get(name: string): string | null };
  ip?: string | null;
}): string | null {
  const raw =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    req.ip ??
    (process.env.NODE_ENV !== "production" ? "127.0.0.1" : null);
  return normalizeClientIp(raw);
}
