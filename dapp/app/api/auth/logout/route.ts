import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookieOptions, verifySession } from "@/lib/auth/session";
import { siteAuthLogout } from "@/lib/site-admin-api";

export async function POST() {
  const token = cookies().get("co_admin_session")?.value;
  const session = await verifySession(token);
  if (session?.sessionId) {
    await siteAuthLogout(session.sessionId);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearSessionCookieOptions());
  return res;
}
