import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { SiteAdminRole } from '../../db/schema-site-admins';

import {

  getSiteAdminStore,

  SITE_ADMIN_ROLE_LABELS,

  type SiteAdminUser,

} from '../../services/siteAdminStore';

import { resolveClientIp } from '../../utils/clientIp';



function clientIp(req: FastifyRequest): string | null {

  const xf = req.headers['x-forwarded-for'];

  const forwarded = typeof xf === 'string' ? xf : null;

  return resolveClientIp(forwarded, req.ip ?? null);

}



function clientUa(req: FastifyRequest): string | null {

  const ua = req.headers['user-agent'];

  return typeof ua === 'string' ? ua : null;

}



function authFromHeaders(req: FastifyRequest): SiteAdminUser | null {

  const sessionId = req.headers['x-site-session-id'];

  const userId = req.headers['x-site-user-id'];

  if (typeof sessionId !== 'string' || typeof userId !== 'string') return null;

  const result = getSiteAdminStore().assertSession(sessionId, userId);

  return result.ok ? result.user : null;

}



function requireDeveloper(

  req: FastifyRequest,

  reply: FastifyReply,

): SiteAdminUser | null {

  const user = authFromHeaders(req);

  if (!user) {

    void reply.code(401).send({ ok: false, error: 'nao_autenticado' });

    return null;

  }

  if (user.role !== 'developer') {

    void reply.code(403).send({ ok: false, error: 'sem_permissao' });

    return null;

  }

  return user;

}



const ROLES: SiteAdminRole[] = ['developer', 'community_manager', 'moderator'];



export function registerSiteAdminRoutes(app: FastifyInstance): void {

  const store = () => getSiteAdminStore();



  app.post('/api/site/auth/login', async (req, reply) => {

    const body = req.body as { username?: string; password?: string };

    const username = body.username?.trim() ?? '';

    const password = body.password ?? '';

    if (!username || !password) {

      return reply.code(400).send({ ok: false, error: 'credenciais_ausentes' });

    }



    const result = store().login(username, password, clientIp(req), clientUa(req));

    if (!result.ok) {

      const status = result.error === 'conta_desativada' ? 403 : 401;

      return reply.code(status).send({ ok: false, error: result.error });

    }



    return {

      ok: true,

      user: {

        id: result.user.id,

        username: result.user.username,

        role: result.user.role,

        roleLabel: SITE_ADMIN_ROLE_LABELS[result.user.role],

      },

      sessionId: result.session.id,

    };

  });



  app.post('/api/site/auth/verify', async (req, reply) => {

    const body = req.body as { sessionId?: string; userId?: string };

    if (!body.sessionId || !body.userId) {

      return reply.code(400).send({ ok: false, error: 'sessao_ausente' });

    }

    const result = store().assertSession(body.sessionId, body.userId);

    if (!result.ok) {

      const status = result.error === 'conta_desativada' ? 403 : 401;

      return reply.code(status).send({ ok: false, error: result.error });

    }

    return {

      ok: true,

      user: {

        id: result.user.id,

        username: result.user.username,

        role: result.user.role,

        roleLabel: SITE_ADMIN_ROLE_LABELS[result.user.role],

      },

    };

  });



  app.post('/api/site/auth/logout', async (req) => {

    const body = req.body as { sessionId?: string };

    if (body.sessionId) store().revokeSession(body.sessionId);

    return { ok: true };

  });



  app.post('/api/site/auth/change-password', async (req, reply) => {

    const user = authFromHeaders(req);

    if (!user) {

      return reply.code(401).send({ ok: false, error: 'nao_autenticado' });

    }

    const body = req.body as { currentPassword?: string; newPassword?: string };

    const currentPassword = body.currentPassword ?? '';

    const newPassword = body.newPassword ?? '';

    if (!currentPassword || !newPassword) {

      return reply.code(400).send({ ok: false, error: 'dados_invalidos' });

    }

    const result = store().changePassword(user.id, currentPassword, newPassword);

    if (result !== 'ok') {

      const status = result === 'conta_desativada' ? 403 : 400;

      return reply.code(status).send({ ok: false, error: result });

    }

    store().revokeAllSessions(user.id);

    return { ok: true };

  });



  app.get('/api/site/admins', async (req, reply) => {

    if (!requireDeveloper(req, reply)) return;

    const users = store().listUsers().map((u) => ({

      id: u.id,

      username: u.username,

      role: u.role,

      roleLabel: SITE_ADMIN_ROLE_LABELS[u.role],

      active: u.active,

      createdAt: u.createdAt,

      deactivatedAt: u.deactivatedAt,

      purgeAt: u.purgeAt,

      lastLoginAt: u.lastLoginAt,

      lastLoginIp: u.lastLoginIp,

      lastLoginUserAgent: u.lastLoginUserAgent,

      activeSessions: u.activeSessions,

    }));

    return { ok: true, users };

  });



  app.post('/api/site/admins', async (req, reply) => {

    const actor = requireDeveloper(req, reply);

    if (!actor) return;



    const body = req.body as { username?: string; password?: string; role?: SiteAdminRole };

    const username = body.username?.trim() ?? '';

    const password = body.password ?? '';

    const role = body.role;



    if (!username || !password || !role || !ROLES.includes(role)) {

      return reply.code(400).send({ ok: false, error: 'dados_invalidos' });

    }

    if (password.length < 8) {

      return reply.code(400).send({ ok: false, error: 'senha_curta' });

    }



    try {

      const user = store().createUser(username, password, role);

      return {

        ok: true,

        user: {

          id: user.id,

          username: user.username,

          role: user.role,

          roleLabel: SITE_ADMIN_ROLE_LABELS[user.role],

        },

      };

    } catch {

      return reply.code(409).send({ ok: false, error: 'usuario_existe' });

    }

  });



  app.patch<{ Params: { id: string } }>('/api/site/admins/:id', async (req, reply) => {

    const actor = requireDeveloper(req, reply);

    if (!actor) return;



    const body = req.body as { password?: string; active?: boolean };

    const hasPassword = typeof body.password === 'string' && body.password.length > 0;

    const hasActive = typeof body.active === 'boolean';



    if (!hasPassword && !hasActive) {

      return reply.code(400).send({ ok: false, error: 'dados_invalidos' });

    }



    if (hasPassword) {

      const pwResult = store().adminSetPassword(req.params.id, body.password!);

      if (pwResult !== 'ok') {

        return reply.code(400).send({ ok: false, error: pwResult });

      }

      store().revokeAllSessions(req.params.id);

    }



    if (hasActive) {

      const activeResult = store().setUserActive(req.params.id, body.active!, actor.id);

      if (activeResult !== 'ok') {

        const status = activeResult === 'nao_pode_desativar_a_si' ? 400 : 404;

        return reply.code(status).send({ ok: false, error: activeResult });

      }

    }



    const user = store().findById(req.params.id);

    if (!user) return reply.code(404).send({ ok: false, error: 'nao_encontrado' });



    return {

      ok: true,

      user: {

        id: user.id,

        username: user.username,

        role: user.role,

        roleLabel: SITE_ADMIN_ROLE_LABELS[user.role],

        active: user.active,

        deactivatedAt: user.deactivatedAt,

      },

    };

  });



  app.delete<{ Params: { id: string } }>('/api/site/admins/:id', async (req, reply) => {

    const actor = requireDeveloper(req, reply);

    if (!actor) return;

    if (req.params.id === actor.id) {

      return reply.code(400).send({ ok: false, error: 'nao_pode_excluir_a_si' });

    }

    const ok = store().deleteUser(req.params.id);

    if (!ok) return reply.code(404).send({ ok: false, error: 'nao_encontrado' });

    return { ok: true };

  });



  app.post<{ Params: { id: string } }>(

    '/api/site/admins/:id/revoke-sessions',

    async (req, reply) => {

      if (!requireDeveloper(req, reply)) return;

      const revoked = store().revokeAllSessions(req.params.id);

      return { ok: true, revoked };

    },

  );



  app.get<{ Params: { id: string } }>('/api/site/admins/:id/logins', async (req, reply) => {

    if (!requireDeveloper(req, reply)) return;

    const logins = store().listLoginEvents(req.params.id);

    return { ok: true, logins };

  });



  app.get<{ Params: { id: string } }>('/api/site/admins/:id/sessions', async (req, reply) => {

    if (!requireDeveloper(req, reply)) return;

    const sessions = store().listSessions(req.params.id);

    return { ok: true, sessions };

  });

}


