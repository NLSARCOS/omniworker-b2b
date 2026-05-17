"use client";

import { useState, useEffect } from "react";

/* ─── Types ─── */
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

interface LicenseData {
  id: string;
  name: string;
  status: string;
  deviceFingerprint: string | null;
  activatedAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  _count: { apiKeys: number };
  apiKeys: { id: string; name: string; keyPrefix: string; lastUsedAt: string | null }[];
}

interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  licenseId: string | null;
  license: { id: string; name: string; status: string } | null;
}

interface AgentData {
  id: string;
  agentName: string;
  hostname: string;
  platform: string;
  status: string;
}

/* ─── Brutalist Components ─── */

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-8 pb-5 border-b border-zinc-800">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white uppercase leading-none m-0">{title}</h1>
        <p className="text-xs text-zinc-500 mt-2 font-mono uppercase tracking-wider">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ title, value, progress, subtitle }: { title: string; value: string | number; progress?: number; subtitle?: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 p-6 flex flex-col justify-center">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 font-mono">{title}</p>
      <p className="text-3xl font-bold tracking-tight text-white leading-none m-0">{value}</p>
      {progress !== undefined && (
        <>
          <div className="h-1 bg-zinc-800 overflow-hidden mt-3">
            <div className={`h-full transition-all duration-500 ${progress > 90 ? 'bg-red-500' : 'bg-lime-500'}`} style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          {subtitle && <p className="text-[10px] text-zinc-500 mt-2 font-mono">{subtitle}</p>}
        </>
      )}
    </div>
  );
}

function StatsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {children}
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="mb-8 border border-zinc-800 p-6 bg-zinc-950/50 backdrop-blur-sm">
      <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-5 pb-3 border-b border-zinc-800 font-mono flex items-center gap-2">{title}</h2>
      {children}
    </div>
  );
}

function Badge({ variant, children }: { variant: "success" | "warning" | "danger" | "info" | "default"; children: React.ReactNode }) {
  const v = {
    success: "border-lime-500/30 text-lime-400 bg-lime-500/10",
    warning: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
    danger: "border-red-500/30 text-red-400 bg-red-500/10",
    info: "border-blue-500/30 text-blue-400 bg-blue-500/10",
    default: "border-zinc-700 text-zinc-400 bg-zinc-800/50"
  }[variant] || "border-zinc-700 text-zinc-400 bg-zinc-800/50";
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono border ${v}`}>
      {children}
    </span>
  );
}

function Button({ variant = "primary", onClick, disabled, children, small }: { variant?: "primary" | "secondary" | "danger"; onClick: () => void; disabled?: boolean; children: React.ReactNode; small?: boolean }) {
  const v = {
    primary: "bg-lime-500 text-black hover:bg-lime-400 border-lime-500",
    secondary: "bg-zinc-800 text-white hover:bg-zinc-700 border-zinc-700",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/50"
  }[variant] || "bg-lime-500 text-black";
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 ${small ? "px-3 py-1.5 text-[10px]" : "px-6 py-2.5 text-xs"} font-bold uppercase tracking-wider font-mono border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${v}`}
    >
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl shadow-black">
        <div className="flex justify-between items-center p-6 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider m-0">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function DashboardPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [licenses, setLicenses] = useState<LicenseData[]>([]);
  const [licenseUsage, setLicenseUsage] = useState({ active: 0, max: 1 });
  const [loading, setLoading] = useState(true);

  // Generate key state
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [newKeyLicense, setNewKeyLicense] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // New license modal
  const [showNewLicense, setShowNewLicense] = useState(false);
  const [newLicenseName, setNewLicenseName] = useState("");
  const [creatingLicense, setCreatingLicense] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  // New key modal
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedLicenseId, setSelectedLicenseId] = useState("");

  // Delete key confirmation
  const [deleteKeyConfirm, setDeleteKeyConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deletingKey, setDeletingKey] = useState(false);

  // Revoke license confirmation
  const [revokeLicenseConfirm, setRevokeLicenseConfirm] = useState<{ id: string; name: string } | null>(null);
  const [revokingLicense, setRevokingLicense] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("ow_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const meRes = await fetch("/api/v1/auth/me", { headers });
      const meData = await meRes.json();
      if (meData.success) {
        setUser(meData.user);
        if (meData.user.tenantId) {
          const [agentsRes, keysRes, licensesRes] = await Promise.allSettled([
            fetch("/api/v1/edge/status", { headers }).then(r => r.json()),
            fetch("/api/v1/apikeys", { headers }).then(r => r.json()),
            fetch("/api/v1/licenses", { headers }).then(r => r.json()),
          ]);
          if (agentsRes.status === "fulfilled" && agentsRes.value?.success) setAgents(agentsRes.value.agents || []);
          if (keysRes.status === "fulfilled" && keysRes.value?.success) setApiKeys(keysRes.value.keys || []);
          if (licensesRes.status === "fulfilled" && licensesRes.value?.success) {
            setLicenses(licensesRes.value.licenses || []);
            setLicenseUsage(licensesRes.value.usage || { active: 0, max: 1 });
          }
        }
      } else {
        window.location.href = "/login";
      }
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateLicense = async () => {
    setCreatingLicense(true);
    setLicenseError(null);
    try {
      const token = localStorage.getItem("ow_token");
      const res = await fetch("/api/v1/licenses", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: newLicenseName || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewLicense(false);
        setNewLicenseName("");
        loadData();
      } else {
        setLicenseError(data.error || "Error desconocido");
      }
    } catch (e: unknown) {
      setLicenseError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCreatingLicense(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!selectedLicenseId) return;
    setGeneratingKey(true);
    setKeyError(null);
    try {
      const token = localStorage.getItem("ow_token");
      const res = await fetch("/api/v1/apikeys", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: newKeyName || "Desktop Agent Key", licenseId: selectedLicenseId }),
      });
      const data = await res.json();
      if (data.success) {
        setNewKeyRaw(data.apiKey.key);
        setNewKeyLicense(data.apiKey.licenseName);
        setShowNewKey(false);
        setNewKeyName("");
        setSelectedLicenseId("");
        loadData();
      } else {
        setKeyError(data.error || "Error desconocido");
      }
    } catch (e: unknown) {
      setKeyError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!deleteKeyConfirm) return;
    setDeletingKey(true);
    try {
      const token = localStorage.getItem("ow_token");
      const res = await fetch(`/api/v1/apikeys?id=${deleteKeyConfirm.id}`, { 
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (data.success) {
        setDeleteKeyConfirm(null);
        loadData();
      }
    } finally {
      setDeletingKey(false);
    }
  };

  const handleRevokeLicense = async () => {
    if (!revokeLicenseConfirm) return;
    setRevokingLicense(true);
    try {
      const token = localStorage.getItem("ow_token");
      const res = await fetch(`/api/v1/licenses/${revokeLicenseConfirm.id}`, { 
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (data.success) {
        setRevokeLicenseConfirm(null);
        loadData();
      }
    } finally {
      setRevokingLicense(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-2xl font-bold uppercase font-mono text-zinc-500 animate-pulse">Cargando...</p>
      </div>
    );
  }

  if (!user) return null;

  const onlineAgents = agents.filter(a => a.status === "online").length;
  const tokenPct = user.tokenBalance > 0 ? Math.min(100, (user.tokenBalance / 100000) * 100) : 0;
  const activeLicenses = licenses.filter(l => l.status === "ACTIVE");

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${user.tenantName || user.email} / ${(user.plan || "FREE").toUpperCase()} PLAN`}
      />

      {/* Subscription warning */}
      {user.isLocked && (
        <div className="mb-8 p-5 bg-red-500/10 border border-red-500/50 rounded-md">
          <strong className="uppercase text-red-500">Saldo Insuficiente</strong>
          <p className="m-0 mt-1 text-sm text-zinc-400">Tu balance de tokens está agotado. Contacta a tu administrador.</p>
        </div>
      )}

      {/* Stats */}
      <StatsGrid>
        <StatCard title="Tokens Disponibles" value={user.tokenBalance.toLocaleString()} progress={tokenPct} subtitle={`${tokenPct}% restante`} />
        <StatCard title="Plan" value={(user.plan || "Free").toUpperCase()} />
        <StatCard title="Instalaciones" value={`${licenseUsage.active} / ${licenseUsage.max}`} progress={(licenseUsage.active / Math.max(licenseUsage.max, 1)) * 100} />
      </StatsGrid>

      {/* Licenses / Instalaciones */}
      <Section title={`LICENCIAS / INSTALACIONES — ${licenseUsage.active} / ${licenseUsage.max}`} id="licenses">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-zinc-400 m-0">Cada instalación autorizada. Revocar una elimina todas sus claves.</p>
          <Button onClick={() => setShowNewLicense(true)} disabled={licenseUsage.active >= licenseUsage.max}>
            + NUEVA LICENCIA
          </Button>
        </div>

        {licenseUsage.active >= licenseUsage.max && (
          <div className="p-3 bg-red-500/10 border border-red-500/50 mb-4 rounded-md">
            <p className="text-sm text-red-400 m-0 font-bold">Límite de instalaciones alcanzado. Actualizá tu plan para agregar más.</p>
          </div>
        )}

        {licenses.length === 0 ? (
          <div className="text-center py-12 px-5 text-zinc-500">
            <p className="font-bold uppercase m-0 mb-2">Sin licencias</p>
            <p className="text-sm m-0">Creá tu primera instalación.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Nombre</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Estado</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Última Actividad</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Claves</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((lic) => (
                  <tr key={lic.id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 font-semibold text-zinc-100">{lic.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={lic.status === "ACTIVE" ? "success" : "danger"}>
                        {lic.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {lic.lastSeenAt ? new Date(lic.lastSeenAt).toLocaleString() : "Nunca"}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{lic._count.apiKeys}</td>
                    <td className="px-4 py-3">
                      {lic.status === "ACTIVE" && (
                        <Button variant="danger" onClick={() => setRevokeLicenseConfirm({ id: lic.id, name: lic.name })} small>
                          REVOCAR
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* API Keys */}
      <Section title="API KEYS — CONEXIÓN AGENTE" id="keys">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-zinc-400 m-0">Claves vinculadas a una licencia. Eliminar corta acceso inmediatamente.</p>
          <Button onClick={() => setShowNewKey(true)} disabled={activeLicenses.length === 0}>
            + NUEVA CLAVE
          </Button>
        </div>

        {activeLicenses.length === 0 && (
          <div className="p-3 bg-zinc-800/50 border border-zinc-700 mb-4 rounded-md">
            <p className="text-sm text-zinc-400 m-0">Creá una licencia primero para poder generar claves API.</p>
          </div>
        )}

        {apiKeys.length === 0 ? (
          <div className="text-center py-12 px-5 text-zinc-500">
            <p className="font-bold uppercase m-0 mb-2">Sin claves activas</p>
            <p className="text-sm m-0">Generá una clave para conectar tu agente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Licencia</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Nombre</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Prefijo</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Último Uso</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 font-semibold text-zinc-100">
                      {key.license ? key.license.name : <span className="text-zinc-500">Sin licencia</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{key.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{key.keyPrefix}...</td>
                    <td className="px-4 py-3 text-zinc-400">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Nunca"}</td>
                    <td className="px-4 py-3">
                      <Button variant="danger" onClick={() => setDeleteKeyConfirm({ id: key.id, name: key.name })} small>
                        ELIMINAR
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Edge Agents */}
      <Section title="AGENTES CONECTADOS" id="agents">
        {agents.length === 0 ? (
          <div className="text-center py-12 px-5 text-zinc-500">
            <p className="font-bold uppercase m-0 mb-2">Sin agentes</p>
            <p className="text-sm m-0">Configura tu agente con tu API Key.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Agente</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Host</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Plataforma</th>
                  <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-widest border-b border-zinc-800 font-mono text-zinc-400">Estado</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} className="border-b border-zinc-800/50">
                    <td className="px-4 py-3 font-semibold text-zinc-100">{agent.agentName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{agent.hostname}</td>
                    <td className="px-4 py-3 text-zinc-300">{agent.platform}</td>
                    <td className="px-4 py-3">
                      <Badge variant={agent.status === "online" ? "success" : agent.status === "busy" ? "warning" : "default"}>
                        {agent.status.toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Quick Actions */}
      <Section title="ACCIONES RÁPIDAS" id="actions">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-zinc-800 bg-zinc-900/50 p-6 rounded-lg hover:border-lime-500/50 transition-colors cursor-pointer group">
            <p className="text-lg font-bold uppercase m-0 mb-2 group-hover:text-lime-400 transition-colors">Descargar Desktop</p>
            <p className="text-sm text-zinc-400 m-0 mb-4">App nativa para macOS, Windows, Linux</p>
            <div className="flex flex-wrap gap-2">
              <a href="https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-latest-mac.zip" className="px-3 py-1.5 text-xs font-bold uppercase font-mono bg-zinc-800 text-zinc-200 no-underline border border-zinc-700 rounded hover:bg-zinc-700 hover:text-white transition-colors">Mac</a>
              <a href="https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-Setup-latest.exe" className="px-3 py-1.5 text-xs font-bold uppercase font-mono bg-zinc-800 text-zinc-200 no-underline border border-zinc-700 rounded hover:bg-zinc-700 hover:text-white transition-colors">Windows</a>
              <a href="https://github.com/Simplex-lat/omniworker-releases/releases/latest/download/Omniworker-latest.AppImage" className="px-3 py-1.5 text-xs font-bold uppercase font-mono bg-zinc-800 text-zinc-200 no-underline border border-zinc-700 rounded hover:bg-zinc-700 hover:text-white transition-colors">Linux</a>
            </div>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/50 p-6 rounded-lg hover:border-lime-500/50 transition-colors cursor-pointer group">
            <p className="text-lg font-bold uppercase m-0 mb-2 group-hover:text-lime-400 transition-colors">Documentación</p>
            <p className="text-sm text-zinc-400 m-0">Guías de instalación y configuración</p>
          </div>
        </div>
      </Section>

      {/* Platform Status */}
      <Section title="ESTADO DE PLATAFORMA">
        <div className="grid grid-cols-3 gap-0 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/30">
          <div className="border-r border-zinc-800 p-4">
            <span className="text-zinc-500 text-sm">Plan</span><br />
            <strong className="text-base text-zinc-100">{(user.plan || "Free").toUpperCase()}</strong>
          </div>
          <div className="border-r border-zinc-800 p-4">
            <span className="text-zinc-500 text-sm">Cuenta</span><br />
            <div className="mt-1">
              <Badge variant={user.isLocked ? "danger" : "success"}>{user.isLocked ? "BLOQUEADA" : "ACTIVA"}</Badge>
            </div>
          </div>
          <div className="p-4">
            <span className="text-zinc-500 text-sm">Organización</span><br />
            <strong className="text-base text-zinc-100">{user.tenantName || "—"}</strong>
          </div>
        </div>
      </Section>

      {/* ── New License Modal ── */}
      {showNewLicense && (
        <Modal title="Nueva Instalación" onClose={() => setShowNewLicense(false)}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest mb-2 font-mono text-zinc-400">Nombre (opcional)</label>
              <input
                type="text"
                value={newLicenseName}
                onChange={e => setNewLicenseName(e.target.value)}
                placeholder="Ej: MacBook Pro Nelson"
                className="w-full px-3 py-2.5 border border-zinc-700 bg-zinc-900 text-zinc-100 font-mono text-sm rounded focus:outline-none focus:border-lime-500 transition-colors"
              />
            </div>
            {licenseError && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-md">
                <p className="text-sm text-red-400 m-0">{licenseError}</p>
              </div>
            )}
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="secondary" onClick={() => setShowNewLicense(false)}>CANCELAR</Button>
              <Button onClick={handleCreateLicense} disabled={creatingLicense}>
                {creatingLicense ? "CREANDO..." : "CREAR INSTALACIÓN"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── New API Key Modal ── */}
      {showNewKey && (
        <Modal title="Nueva Clave API" onClose={() => setShowNewKey(false)}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest mb-2 font-mono text-zinc-400">Licencia *</label>
              <select
                value={selectedLicenseId}
                onChange={e => setSelectedLicenseId(e.target.value)}
                className="w-full px-3 py-2.5 border border-zinc-700 bg-zinc-900 text-zinc-100 font-mono text-sm rounded focus:outline-none focus:border-lime-500 transition-colors"
              >
                <option value="">Seleccionar licencia...</option>
                {activeLicenses.map(lic => (
                  <option key={lic.id} value={lic.id}>{lic.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest mb-2 font-mono text-zinc-400">Nombre (opcional)</label>
              <input
                type="text"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="Ej: Desktop Agent Key"
                className="w-full px-3 py-2.5 border border-zinc-700 bg-zinc-900 text-zinc-100 font-mono text-sm rounded focus:outline-none focus:border-lime-500 transition-colors"
              />
            </div>
            {keyError && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-md">
                <p className="text-sm text-red-400 m-0">{keyError}</p>
              </div>
            )}
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="secondary" onClick={() => setShowNewKey(false)}>CANCELAR</Button>
              <Button onClick={handleGenerateKey} disabled={generatingKey || !selectedLicenseId}>
                {generatingKey ? "GENERANDO..." : "GENERAR CLAVE"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── One-time raw key display ── */}
      {newKeyRaw && (
        <Modal title="Tu Nueva Clave API" onClose={() => setNewKeyRaw(null)}>
          <div className="p-4 bg-lime-500/10 border border-lime-500 mb-4 rounded-md shadow-[0_0_15px_rgba(132,204,22,0.1)]">
            <p className="font-bold text-base text-lime-400 m-0 mb-2">⚠️ Copiá esta clave ahora!</p>
            <p className="text-sm text-zinc-300 m-0 mb-3">
              Vinculada a: <strong className="text-zinc-100">{newKeyLicense}</strong>. No se volverá a mostrar.
            </p>
            <code className="block bg-zinc-950 border border-zinc-800 text-lime-400 p-4 font-mono text-sm break-all rounded">{newKeyRaw}</code>
          </div>
          <div className="flex justify-end mt-2">
            <Button onClick={() => setNewKeyRaw(null)}>ENTENDIDO</Button>
          </div>
        </Modal>
      )}

      {/* ── Delete API Key Confirmation ── */}
      {deleteKeyConfirm && (
        <Modal title="Eliminar Clave API" onClose={() => setDeleteKeyConfirm(null)}>
          <div className="p-4 bg-red-500/10 border border-red-500/50 mb-4 rounded-md">
            <p className="font-bold text-base text-red-500 m-0 mb-2">⚠️ Esta clave se eliminará inmediatamente.</p>
            <p className="text-sm text-zinc-300 m-0">
              La app en ese computador perderá acceso a la plataforma.
            </p>
          </div>
          <p className="text-sm text-zinc-400 mb-4">Clave: <strong className="text-zinc-100">{deleteKeyConfirm.name}</strong></p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" onClick={() => setDeleteKeyConfirm(null)}>CANCELAR</Button>
            <Button variant="danger" onClick={handleDeleteKey} disabled={deletingKey}>
              {deletingKey ? "ELIMINANDO..." : "ELIMINAR DEFINITIVAMENTE"}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Revoke License Confirmation ── */}
      {revokeLicenseConfirm && (
        <Modal title="Revocar Instalación" onClose={() => setRevokeLicenseConfirm(null)}>
          <div className="p-4 bg-red-500/10 border border-red-500/50 mb-4 rounded-md">
            <p className="font-bold text-base text-red-500 m-0 mb-2">⚠️ Todas las claves de esta instalación serán eliminadas.</p>
            <p className="text-sm text-zinc-300 m-0">
              Las apps en los computadores asociados perderán acceso inmediatamente.
            </p>
          </div>
          <p className="text-sm text-zinc-400 mb-4">Instalación: <strong className="text-zinc-100">{revokeLicenseConfirm.name}</strong></p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" onClick={() => setRevokeLicenseConfirm(null)}>CANCELAR</Button>
            <Button variant="danger" onClick={handleRevokeLicense} disabled={revokingLicense}>
              {revokingLicense ? "REVOCANDO..." : "REVOCAR DEFINITIVAMENTE"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}