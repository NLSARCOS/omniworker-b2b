// src/app/dashboard/page.tsx — Dashboard del usuario autenticado
"use client";

import { useState, useEffect } from "react";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string | null;
  tenantName: string | null;
  tokenBalance: number;
  plan: string | null;
  isLocked: boolean;
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ow_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    // Load user data
    fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setUser(data.user);
          // Load edge agents
          if (data.user.tenantId) {
            return fetch("/api/v1/edge/status", {
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        } else {
          localStorage.removeItem("ow_token");
          window.location.href = "/login";
        }
        return null;
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data?.success) setAgents(data.agents);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("ow_token");
    localStorage.removeItem("ow_user");
    window.location.href = "/";
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black font-mono">
        <p className="text-2xl uppercase font-bold">Cargando...</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen p-8 font-mono bg-white text-black">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start border-b-4 border-black pb-6 mb-8">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold uppercase tracking-tighter">
              Dashboard
            </h1>
            <p className="text-lg uppercase mt-2">
              {user.tenantName || user.name || user.email}
            </p>
          </div>
          <div className="flex gap-3">
            {user.role === "SUPERADMIN" && (
              <a
                href="/admin"
                className="bg-black text-white px-4 py-2 text-sm font-bold uppercase border-2 border-black"
              >
                Admin
              </a>
            )}
            <button
              onClick={handleLogout}
              className="border-2 border-black px-4 py-2 text-sm font-bold uppercase hover:bg-black hover:text-white"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="border-4 border-black p-6">
            <p className="text-xs uppercase font-bold mb-1">Tokens</p>
            <p className="text-4xl font-bold">{user.tokenBalance.toLocaleString()}</p>
          </div>
          <div className="border-4 border-black p-6">
            <p className="text-xs uppercase font-bold mb-1">Plan</p>
            <p className="text-4xl font-bold">{user.plan || "Free"}</p>
          </div>
          <div className="border-4 border-black p-6">
            <p className="text-xs uppercase font-bold mb-1">Agentes</p>
            <p className="text-4xl font-bold">{agents.length}</p>
          </div>
        </div>

        {/* Edge Agents */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold uppercase bg-black text-white p-2 inline-block mb-4">
            Agentes Edge
          </h2>

          {agents.length === 0 ? (
            <div className="border-4 border-black p-8 text-center">
              <p className="text-lg uppercase font-bold mb-2">
                Sin agentes conectados
              </p>
              <p className="text-sm opacity-60">
                Instala OmniWorker en tu equipo y ejecuta{" "}
                <code className="bg-gray-200 px-2 py-1">
                  omniworker edge connect
                </code>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="border-4 border-black p-4 flex justify-between items-center"
                >
                  <div>
                    <p className="font-bold text-lg">{agent.agentName}</p>
                    <p className="text-sm opacity-60">
                      {agent.hostname} · {agent.platform}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 text-sm font-bold uppercase border-2 ${
                        agent.status === "online"
                          ? "border-black bg-black text-white"
                          : "border-black bg-white text-black"
                      }`}
                    >
                      {agent.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl font-bold uppercase bg-black text-white p-2 inline-block mb-4">
            Acciones
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="#"
              className="border-4 border-black p-6 hover:bg-black hover:text-white transition-colors block"
            >
              <p className="text-xl font-bold uppercase">Descargar Desktop</p>
              <p className="text-sm mt-1 opacity-60">
                App nativa para macOS, Linux, Windows
              </p>
            </a>
            <a
              href="#"
              className="border-4 border-black p-6 hover:bg-black hover:text-white transition-colors block"
            >
              <p className="text-xl font-bold uppercase">Documentación</p>
              <p className="text-sm mt-1 opacity-60">
                Guías de instalación y configuración
              </p>
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
