import { NextResponse } from "next/server";

import { clearDeactivatedSession, getAuthStatus } from "@/lib/auth/server";

import { clearSessionCookieOptions } from "@/lib/auth/session";



export async function GET() {

  const status = await getAuthStatus();



  if (status.status === "authenticated") {

    return NextResponse.json({

      authenticated: true,

      user: {

        id: status.user.id,

        username: status.user.username,

        role: status.user.role,

        roleLabel: status.user.roleLabel,

      },

    });

  }



  if (status.status === "deactivated") {

    await clearDeactivatedSession(status.sessionId);

    const res = NextResponse.json({ authenticated: false, deactivated: true });

    res.cookies.set(clearSessionCookieOptions());

    return res;

  }



  return NextResponse.json({ authenticated: false });

}


