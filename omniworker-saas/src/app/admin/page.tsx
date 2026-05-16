// src/app/admin/page.tsx — Superadmin multi-tenant
"use client";

import { useState, useEffect } from "react";

interface Provider {
  id: string;
  provider: string;
  isActive: boolean;
  priority: number;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  plan: string | null;
  tokenLimit: number;
  users: number;
  agents: number;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  tokenBalance: number;
  tenant: { name: string; slug: string } | null;
}

type Tab = "providers" | "tenants" | "users" | "plans";

export default function SuperAdminPage() {
  const [tab, setTab] = useState<Tab>("providers");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("ow_token");
    if (t) {
      setToken(t);
      loadData(t);
    }
  }, []);

  const authFetch = (url: string, opts?: RequestInit) =>
    fetch(url, {
      ...opts,
      headers: { ...opts?.headers, Authorization: `Bearer ${token}` },
    });

  const loadData = async (t: string) => {
    const headers = { Authorization: `Bearer ${t}` };
    const [pRes, tRes, uRes] = await Promise.all([
      fetch("/api/admin/providers", { headers }).then((r) => r.json()),
      fetch("/api/admin/tenants", { headers }).then((r) => r.json()),
      fetch("/api/admin/users", { headers }).then((r) => r.json()),
    ]);
    if (pRes.providers) setProviders(pRes.providers);
    if (tRes.tenants) setTenants(tRes.tenants);
    if (uRes.users) setUsers(uRes.users);
  };

  const saveProvider = async (provider: string, apiKey: string) => {
    setLoading(true);
    await authFetch("/api/admin/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, isActive: true }),
    });
    await loadData(token);
    setLoading(false);
  };

  const updateUserBalance = async (userId: string, balance: number) => {
    await authFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, tokenBalance: balance }),
    });
    await loadData(token);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "providers", label: "Providers" },
    { key: "tenants", label: "Empresas" },
    { key: "users", label: "Usuarios" },
    { key: "plans", label: "Planes" },
  ];

  return (
    <main className="min-h-screen p-8 font-mono bg-white text-black">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-start border-b-4 border-black pb-6 mb-6">
          <h1 className="text-4xl sm:text-6xl font-bold uppercase tracking-tighter">
            Superadmin
          </h1>
          <a
            href="/dashboard"
            className="border-2 border-black px-4 py-2 text-sm font-bold uppercase"
          >
            ← Dashboard
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b-4 border-black">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-6 py-3 text-sm font-bold uppercase transition-colors ${
                tab === t.key
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* PROVIDERS TAB */}
        {tab === "providers" && (
          <div className="space-y-4">
            {[
              { name: "openai", placeholder: "sk-proj-..." },
              { name: "anthropic", placeholder: "sk-ant-..." },
              { name: "deepseek", placeholder: "sk-..." },
              { name: "moonshot", placeholder: "sk-..." },
              { name: "minimax", placeholder: "sk-..." },
            ].map((p) => (
              <div
                key={p.name}
                className="border-4 border-black p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
              >
                <div>
                  <p className="text-xl font-bold uppercase">{p.name}</p>
                  <p className="text-xs opacity-60">
                    {providers.find((x) => x.provider === p.name)?.isActive
                      ? "✓ Activo"
                      : "✗ Inactivo"}
                  </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="password"
                    id={`key-${p.name}`}
                    className="flex-grow border-2 border-black p-2 font-mono"
                    placeholder={p.placeholder}
                  />
                  <button
                    onClick={() => {
                      const el = document.getElementById(
                        `key-${p.name}`
                      ) as HTMLInputElement;
                      if (el?.value) saveProvider(p.name, el.value);
                    }}
                    disabled={loading}
                    className="bg-black text-white px-4 py-2 font-bold uppercase text-sm"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TENANTS TAB */}
        {tab === "tenants" && (
          <table className="w-full border-collapse border-4 border-black">
            <thead>
              <tr className="bg-black text-white">
                <th className="p-3 text-left uppercase border-r-2 border-white">
                  Empresa
                </th>
                <th className="p-3 text-left uppercase border-r-2 border-white">
                  Plan
                </th>
                <th className="p-3 text-left uppercase border-r-2 border-white">
                  Usuarios
                </th>
                <th className="p-3 text-left uppercase border-r-2 border-white">
                  Agentes
                </th>
                <th className="p-3 text-left uppercase">Estado</th>
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center opacity-60">
                    Sin empresas registradas
                  </td>
                </tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id} className="border-b-2 border-black">
                    <td className="p-3 border-r-2 border-black font-bold">
                      {t.name}
                      <br />
                      <span className="text-xs opacity-60">{t.slug}</span>
                    </td>
                    <td className="p-3 border-r-2 border-black">
                      {t.plan || "—"}
                    </td>
                    <td className="p-3 border-r-2 border-black">{t.users}</td>
                    <td className="p-3 border-r-2 border-black">{t.agents}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 text-xs font-bold uppercase ${
                          t.isActive
                            ? "bg-black text-white"
                            : "bg-white text-black border border-black"
                        }`}
                      >
                        {t.isActive ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <table className="w-full border-collapse border-4 border-black">
            <thead>
              <tr className="bg-black text-white">
                <th className="p-3 text-left uppercase border-r-2 border-white">
                  Usuario
                </th>
                <th className="p-3 text-left uppercase border-r-2 border-white">
                  Rol
                </th>
                <th className="p-3 text-left uppercase border-r-2 border-white">
                  Empresa
                </th>
                <th className="p-3 text-left uppercase border-r-2 border-white">
                  Tokens
                </th>
                <th className="p-3 text-left uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b-2 border-black">
                  <td className="p-3 border-r-2 border-black">
                    <span className="font-bold">{u.name || u.email}</span>
                    <br />
                    <span className="text-xs opacity-60">{u.email}</span>
                  </td>
                  <td className="p-3 border-r-2 border-black font-bold uppercase text-sm">
                    {u.role}
                  </td>
                  <td className="p-3 border-r-2 border-black">
                    {u.tenant?.name || "—"}
                  </td>
                  <td className="p-3 border-r-2 border-black font-bold">
                    {u.tokenBalance.toLocaleString()}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() =>
                        updateUserBalance(u.id, u.tokenBalance + 1000)
                      }
                      className="border-2 border-black px-3 py-1 text-xs font-bold uppercase hover:bg-black hover:text-white"
                    >
                      +1000
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* PLANS TAB */}
        {tab === "plans" && (
          <div className="text-center opacity-60 p-8">
            <p>Gestiona planes desde la API: POST /api/admin/plans</p>
            <p className="text-sm mt-2">O usa el CLI para crear planes</p>
          </div>
        )}
      </div>
    </main>
  );
}
