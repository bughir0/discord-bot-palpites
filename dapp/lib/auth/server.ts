import { cookies } from "next/headers";

import type { NextRequest } from "next/server";

import {

  ROLE_LABELS,

  verifySession,

  type AdminSession,

  type SiteAdminRole,

} from "@/lib/auth/session";

import { siteAuthLogout, siteAuthVerify } from "@/lib/site-admin-api";



export type AuthUser = {

  id: string;

  username: string;

  role: SiteAdminRole;

  roleLabel: string;

  sessionId: string;

};



export type AuthStatus =

  | { status: "authenticated"; user: AuthUser }

  | { status: "guest" }

  | { status: "deactivated"; sessionId?: string };



export async function getSessionFromCookies(): Promise<AdminSession | null> {

  const token = cookies().get("co_admin_session")?.value;

  return verifySession(token);

}



async function sessionToken(req?: NextRequest): Promise<string | undefined> {

  return (

    req?.cookies.get("co_admin_session")?.value ??

    cookies().get("co_admin_session")?.value

  );

}



export async function getAuthStatus(req?: NextRequest): Promise<AuthStatus> {

  const session = await verifySession(await sessionToken(req));

  if (!session) return { status: "guest" };



  const verified = await siteAuthVerify(session.sessionId, session.sub);

  if (verified.ok && verified.user) {

    return {

      status: "authenticated",

      user: {

        id: verified.user.id,

        username: verified.user.username,

        role: verified.user.role,

        roleLabel: verified.user.roleLabel ?? ROLE_LABELS[verified.user.role],

        sessionId: session.sessionId,

      },

    };

  }



  if (verified.error === "conta_desativada") {

    return { status: "deactivated", sessionId: session.sessionId };

  }



  return { status: "guest" };

}



export async function getAuthUser(req?: NextRequest): Promise<AuthUser | null> {

  const status = await getAuthStatus(req);

  return status.status === "authenticated" ? status.user : null;

}



export function isDeveloper(user: AuthUser | null): boolean {

  return user?.role === "developer";

}



export async function clearDeactivatedSession(sessionId?: string): Promise<void> {

  if (sessionId) await siteAuthLogout(sessionId);

}


