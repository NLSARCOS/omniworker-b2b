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

interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [agents, setAgents] = useState<{ id: string; agentName: string; hostname: string; platform: string; status: string }[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);

  useEffect(() => {
    // Load user data (cookies are sent automatically)
    fetch("/api/v1/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setUser(data.user);
          // Load edge agents & API keys
          if (data.user.tenantId) {
            Promise.all([
              fetch("/api/v1/edge/status").then(r => r.json()),
              fetch("/api/v1/apikeys").then(r => r.json())
            ]).then(([agentsData, keysData]) => {
              if (agentsData?.success) setAgents(agentsData.agents || []);
              if (keysData?.success) setApiKeys(keysData.keys || []);
            });
          }
        } else {
          window.location.href = "/login";
        }
      })
      .catch(() => {
        window.location.href = "/login";
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const [keyError, setKeyError] = useState<string | null>(null);

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    setKeyError(null);
    try {
      const res = await fetch("/api/v1/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Desktop Agent Key" })
      });
      const data = await res.json();
      
      if (data.success) {
        setNewKeyRaw(data.apiKey.key);
        setApiKeys([{ ...data.apiKey, keyPrefix: data.apiKey.key.substring(0, 16) }, ...apiKeys]);
      } else {
        setKeyError(data.error || "Error desconocido al generar la clave");
      }
    } catch (e: unknown) {
      setKeyError(e instanceof Error ? e.message : "Error de red al generar la clave");
    } finally {
      setGeneratingKey(false);
    }
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
            <p className="text-xs uppercase font-bold mb-1">Tokens Disponibles</p>
            <p className="text-4xl font-bold">{user.tokenBalance.toLocaleString()}</p>
          </div>
          <div className="border-4 border-black p-6">
            <p className="text-xs uppercase font-bold mb-1">Plan</p>
            <p className="text-4xl font-bold">{user.plan || "Free"}</p>
          </div>
          <div className="border-4 border-black p-6">
            <p className="text-xs uppercase font-bold mb-1">Agentes Activos</p>
            <p className="text-4xl font-bold">{agents.length}</p>
          </div>
        </div>

        {/* API Keys */}
        <div className="mb-8">
          <div className="flex justify-between items-center bg-black text-white p-2 mb-4">
            <h2 className="text-2xl font-bold uppercase inline-block">
              API Keys (Conexión Agente)
            </h2>
            <button 
              onClick={handleGenerateKey}
              disabled={generatingKey}
              className="bg-white text-black px-3 py-1 text-sm font-bold uppercase hover:bg-gray-200 disabled:opacity-50"
            >
              + Nueva Clave
            </button>
          </div>

          {keyError && (
            <div className="border-4 border-red-500 bg-red-100 p-4 mb-4 text-red-700">
              <p className="font-bold text-lg mb-2">Error al generar la clave</p>
              <p className="text-sm">{keyError}</p>
              <button 
                onClick={() => setKeyError(null)}
                className="mt-3 border-2 border-red-500 px-3 py-1 text-xs font-bold uppercase hover:bg-red-200"
              >
                Cerrar
              </button>
            </div>
          )}

          {newKeyRaw && (
            <div className="border-4 border-black bg-yellow-100 p-4 mb-4">
              <p className="font-bold text-lg mb-2">¡Copia tu nueva clave ahora!</p>
              <p className="text-sm mb-2">Por seguridad, no volveremos a mostrarla.</p>
              <code className="block bg-black text-white p-3 break-all">{newKeyRaw}</code>
              <button 
                onClick={() => setNewKeyRaw(null)}
                className="mt-3 border-2 border-black px-3 py-1 text-xs font-bold uppercase"
              >
                Entendido
              </button>
            </div>
          )}

          {apiKeys.length === 0 ? (
            <div className="border-4 border-black p-8 text-center">
              <p className="text-lg uppercase font-bold mb-2">
                No tienes claves activas
              </p>
              <p className="text-sm opacity-60">
                Genera una clave para conectar tu OmniWorker Agent Desktop.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="border-4 border-black p-4 flex justify-between items-center"
                >
                  <div>
                    <p className="font-bold">{key.name}</p>
                    <p className="text-sm opacity-60">
                      {key.keyPrefix}... • Creada: {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase">Último uso</p>
                    <p className="text-sm opacity-80">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Nunca'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edge Agents */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold uppercase bg-black text-white p-2 inline-block mb-4">
            Agentes Conectados
          </h2>

          {agents.length === 0 ? (
            <div className="border-4 border-black p-8 text-center">
              <p className="text-lg uppercase font-bold mb-2">
                Sin agentes en línea
              </p>
              <p className="text-sm opacity-60">
                Configura tu agente con tu API Key generada arriba.
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
            <div className="border-4 border-black p-6 flex flex-col justify-between">
              <div>
                <p className="text-xl font-bold uppercase">Descargar Desktop</p>
                <p className="text-sm mt-1 opacity-60 mb-4">
                  App nativa de OmniWorker
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-latest-mac.zip"
                  className="bg-black text-white px-3 py-2 text-xs font-bold uppercase hover:bg-gray-800 transition-colors"
                >
                   Mac (.dmg)
                </a>
                <a
                  href="https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-Setup-latest.exe"
                  className="bg-black text-white px-3 py-2 text-xs font-bold uppercase hover:bg-gray-800 transition-colors"
                >
                  ⊞ Win (.exe)
                </a>
                <a
                  href="https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-latest.AppImage"
                  className="border-2 border-black px-3 py-2 text-xs font-bold uppercase hover:bg-gray-200 transition-colors"
                >
                  🐧 Linux
                </a>
              </div>
            </div>
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
