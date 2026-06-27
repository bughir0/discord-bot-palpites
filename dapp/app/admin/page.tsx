"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";
import type { SiteAdminRole } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/session";
import { normalizeClientIp } from "@/lib/client-ip";

type AdminUserRow = {
  id: string;
  username: string;
  role: SiteAdminRole;
  roleLabel: string;
  active: boolean;
  createdAt: string;
  deactivatedAt: string | null;
  purgeAt: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastLoginUserAgent: string | null;
  activeSessions: number;
};

type LoginEvent = {
  id: number;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

const ROLE_OPTIONS: { value: SiteAdminRole; label: string }[] = [
  { value: "developer", label: ROLE_LABELS.developer },
  { value: "community_manager", label: ROLE_LABELS.community_manager },
  { value: "moderator", label: ROLE_LABELS.moderator },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function fmtIp(ip: string | null): string {
  return normalizeClientIp(ip) ?? "—";
}

function shortUa(ua: string | null): string {
  if (!ua) return "—";
  if (ua.length <= 72) return ua;
  return `${ua.slice(0, 69)}…`;
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logins, setLogins] = useState<Record<string, LoginEvent[]>>({});
  const [loginsLoading, setLoginsLoading] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<SiteAdminRole>("moderator");
  const [creating, setCreating] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [menu, setMenu] = useState<{
    user: AdminUserRow;
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  function openUserMenu(u: AdminUserRow, e: MouseEvent<HTMLButtonElement>) {
    if (menu?.user.id === u.id) {
      setMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = 280;
    let left = Math.max(8, rect.right - menuWidth);
    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 6);
    }
    setMenu({ user: u, top, left });
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await res.json()) as { users?: AdminUserRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro ao carregar usuários.");
        setUsers([]);
        return;
      }
      setUsers(data.users ?? []);
    } catch {
      setError("Falha de conexão com o servidor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function loadLogins(userId: string) {
    if (logins[userId]) {
      setExpandedId(expandedId === userId ? null : userId);
      return;
    }
    setLoginsLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/logins`, { cache: "no-store" });
      const data = (await res.json()) as { logins?: LoginEvent[] };
      setLogins((prev) => ({ ...prev, [userId]: data.logins ?? [] }));
      setExpandedId(userId);
    } catch {
      setError("Não foi possível carregar histórico de login.");
    } finally {
      setLoginsLoading(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msgs: Record<string, string> = {
          usuario_existe: "Este usuário já existe.",
          senha_curta: "Senha deve ter no mínimo 8 caracteres.",
          dados_invalidos: "Preencha todos os campos corretamente.",
        };
        setError(msgs[data.error ?? ""] ?? "Erro ao criar usuário.");
        return;
      }
      setNewUsername("");
      setNewPassword("");
      setNewRole("moderator");
      await loadUsers();
    } catch {
      setError("Falha ao criar usuário.");
    } finally {
      setCreating(false);
    }
  }

  async function revokeSessions(userId: string, username: string) {
    if (!confirm(`Deslogar todas as sessões de "${username}"?`)) return;
    setActionId(userId);
    try {
      await fetch(`/api/admin/users/${userId}/revoke`, { method: "POST" });
      await loadUsers();
    } catch {
      setError("Falha ao revogar sessões.");
    } finally {
      setActionId(null);
    }
  }

  async function toggleActive(u: AdminUserRow) {
    const action = u.active ? "desativar" : "reativar";
    const extra = u.active
      ? " O usuário será deslogado imediatamente."
      : "";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${u.username}"?${extra}`)) {
      return;
    }
    setActionId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !u.active }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msgs: Record<string, string> = {
          nao_pode_desativar_a_si: "Você não pode desativar sua própria conta.",
        };
        setError(msgs[data.error ?? ""] ?? "Erro ao atualizar conta.");
        return;
      }
      await loadUsers();
    } catch {
      setError("Falha ao atualizar conta.");
    } finally {
      setActionId(null);
    }
  }

  async function adminChangePassword(userId: string, username: string) {
    const pw = window.prompt(`Nova senha para "${username}" (mínimo 8 caracteres):`);
    if (!pw) return;
    if (pw.length < 8) {
      setError("Senha deve ter no mínimo 8 caracteres.");
      return;
    }
    setActionId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error === "senha_curta" ? "Senha muito curta." : "Erro ao alterar senha.");
        return;
      }
      await loadUsers();
    } catch {
      setError("Falha ao alterar senha.");
    } finally {
      setActionId(null);
    }
  }

  async function deleteUser(userId: string, username: string) {
    if (!confirm(`Excluir permanentemente o usuário "${username}"?`)) return;
    setActionId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        const msgs: Record<string, string> = {
          nao_pode_excluir_a_si: "Você não pode excluir sua própria conta.",
          nao_encontrado: "Usuário não encontrado.",
        };
        setError(msgs[data.error ?? ""] ?? "Erro ao excluir.");
        return;
      }
      setExpandedId(null);
      await loadUsers();
    } catch {
      setError("Falha ao excluir usuário.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <PageHeader />
      <SiteMain className="py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="badge-pill mb-3 w-fit">
              <span className="badge-pill-dot" />
              Developer
            </div>
            <h1 className="text-3xl font-black sm:text-4xl">Painel de administradores</h1>
            <p className="mt-2 max-w-2xl text-zinc-400">
              Gerencie quem acessa o Quiz: crie contas, altere senhas, desative usuários
              (removidos após 30 dias), veja logins e deslogue sessões.
            </p>
          </div>

          {error ? (
            <p className="mb-6 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <section className="glass-panel-strong mb-8 rounded-2xl p-6">
            <h2 className="text-lg font-bold">Novo usuário</h2>
            <form
              onSubmit={(e) => void onCreate(e)}
              className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Usuário
                </span>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-chiliz/50"
                  required
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Senha
                </span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-chiliz/50"
                  required
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Cargo
                </span>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as SiteAdminRole)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-chiliz/50"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end sm:col-span-1">
                <button type="submit" className="btn-primary w-full" disabled={creating}>
                  {creating ? "Criando…" : "Criar usuário"}
                </button>
              </div>
            </form>
          </section>

          <section className="glass-panel rounded-2xl">
            <div className="border-b border-white/5 px-6 py-4">
              <h2 className="text-lg font-bold">Usuários cadastrados</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Use <strong className="text-zinc-400">Gerenciar</strong> em cada linha para mudar senha,
                desativar ou reativar. Sua própria senha: link <strong className="text-zinc-400">Conta</strong> no topo.
              </p>
            </div>

            {loading ? (
              <p className="px-6 py-10 text-center text-zinc-500">Carregando…</p>
            ) : users.length === 0 ? (
              <p className="px-6 py-10 text-center text-zinc-500">Nenhum usuário.</p>
            ) : (
              <div className="overflow-x-auto pb-2">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-6 py-3 font-semibold">Usuário</th>
                      <th className="px-4 py-3 font-semibold">Cargo</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Último login</th>
                      <th className="px-4 py-3 font-semibold">IP</th>
                      <th className="px-4 py-3 font-semibold">Sessões</th>
                      <th className="min-w-[11rem] px-4 py-3 text-right font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <Fragment key={u.id}>
                        <tr
                          className="border-b border-white/5 transition hover:bg-white/[0.02]"
                        >
                          <td className="px-6 py-4 font-medium">
                            {u.username}
                            {!u.active && u.purgeAt ? (
                              <p className="mt-0.5 text-[10px] text-zinc-500">
                                Exclusão em {fmtDate(u.purgeAt)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <span className="role-badge">{u.roleLabel}</span>
                          </td>
                          <td className="px-4 py-4">
                            {u.active ? (
                              <span className="text-xs text-emerald-400">Ativo</span>
                            ) : (
                              <span className="text-xs text-amber-300">Desativado</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-zinc-400">{fmtDate(u.lastLoginAt)}</td>
                          <td className="px-4 py-4 font-mono text-xs text-zinc-400">
                            {fmtIp(u.lastLoginIp)}
                          </td>
                          <td className="px-4 py-4 text-zinc-400">{u.activeSessions}</td>
                          <td className="sticky right-0 min-w-[11rem] bg-[#0a0a0e] px-4 py-4 shadow-[-8px_0_12px_rgba(0,0,0,0.35)]">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => openUserMenu(u, e)}
                                className="whitespace-nowrap rounded-lg border border-chiliz/40 bg-chiliz/10 px-3 py-1.5 text-xs font-semibold text-chiliz-gold hover:border-chiliz/60"
                                disabled={actionId === u.id}
                              >
                                Gerenciar ▾
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === u.id ? (
                          <tr className="border-b border-white/5 bg-black/20">
                            <td colSpan={7} className="px-6 py-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                Último navegador
                              </p>
                              <p className="mb-4 break-all font-mono text-xs text-zinc-400">
                                {u.lastLoginUserAgent ?? "—"}
                              </p>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                Histórico de logins
                              </p>
                              {(logins[u.id] ?? []).length === 0 ? (
                                <p className="text-sm text-zinc-500">Sem registros.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {(logins[u.id] ?? []).map((ev) => (
                                    <li
                                      key={ev.id}
                                      className="rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-xs"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className={
                                            ev.success
                                              ? "text-emerald-400"
                                              : "text-red-400"
                                          }
                                        >
                                          {ev.success ? "Sucesso" : "Falha"}
                                        </span>
                                        <span className="text-zinc-500">
                                          {fmtDate(ev.createdAt)}
                                        </span>
                                        <span className="font-mono text-zinc-400">
                                          {fmtIp(ev.ip)}
                                        </span>
                                      </div>
                                      <p className="mt-1 break-all text-zinc-500">
                                        {shortUa(ev.userAgent)}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </SiteMain>
      {menu && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Fechar menu"
                className="fixed inset-0 z-[200] cursor-default bg-black/20"
                onClick={() => setMenu(null)}
              />
              <div
                className="fixed z-[201] w-60 rounded-xl border border-white/10 bg-[#121218] py-1 shadow-2xl"
                style={{ top: menu.top, left: menu.left }}
              >
                <p className="border-b border-white/5 px-4 py-2 text-xs font-semibold text-zinc-400">
                  {menu.user.username}
                </p>
                <button
                  type="button"
                  className="block w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/5"
                  onClick={() => {
                    setMenu(null);
                    void adminChangePassword(menu.user.id, menu.user.username);
                  }}
                >
                  Mudar senha
                </button>
                <button
                  type="button"
                  className="block w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/5"
                  onClick={() => {
                    const target = menu.user;
                    setMenu(null);
                    void toggleActive(target);
                  }}
                >
                  {menu.user.active ? "Desativar conta" : "Reativar conta"}
                </button>
                <button
                  type="button"
                  className="block w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/5 disabled:text-zinc-600"
                  disabled={menu.user.activeSessions === 0}
                  onClick={() => {
                    const target = menu.user;
                    setMenu(null);
                    void revokeSessions(target.id, target.username);
                  }}
                >
                  Deslogar sessões
                </button>
                <button
                  type="button"
                  className="block w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/5"
                  onClick={() => {
                    const target = menu.user;
                    setMenu(null);
                    void loadLogins(target.id);
                  }}
                >
                  {expandedId === menu.user.id ? "Ocultar histórico" : "Ver histórico"}
                </button>
                <hr className="my-1 border-white/5" />
                <button
                  type="button"
                  className="block w-full px-4 py-2.5 text-left text-sm text-red-300 hover:bg-red-950/30"
                  onClick={() => {
                    const target = menu.user;
                    setMenu(null);
                    void deleteUser(target.id, target.username);
                  }}
                >
                  Excluir permanentemente
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
