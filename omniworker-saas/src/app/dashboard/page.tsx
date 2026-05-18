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
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, paddingBottom: 20, borderBottom: "3px solid #111" }}>
      <div>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-1px", textTransform: "uppercase", lineHeight: 1, margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 13, color: "#555", marginTop: 6, fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ title, value, progress, subtitle }: { title: string; value: string | number; progress?: number; subtitle?: string }) {
  return (
    <div style={{ background: "#fff", padding: 24, border: "none" }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#555", marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>{title}</p>
      <p style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-2px", lineHeight: 1, margin: 0 }}>{value}</p>
      {progress !== undefined && (
        <>
          <div style={{ height: 4, background: "#eee", overflow: "hidden", marginTop: 12 }}>
            <div style={{ height: "100%", width: `${Math.min(progress, 100)}%`, background: progress > 90 ? "#ff0000" : "#000", transition: "width 0.6s ease" }} />
          </div>
          {subtitle && <p style={{ fontSize: 12, color: "#888", marginTop: 6, fontFamily: "'Space Mono', monospace" }}>{subtitle}</p>}
        </>
      )}
    </div>
  );
}

function StatsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 0, marginBottom: 32, border: "3px solid #111", boxShadow: "4px 4px 0 0 #111" }}>
      {children}
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ marginBottom: 32, border: "3px solid #111", padding: 24, background: "#fff", boxShadow: "4px 4px 0 0 #111" }}>
      <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #e0e0e0", fontFamily: "'Space Mono', monospace" }}>{title}</h2>
      {children}
    </div>
  );
}

function Badge({ variant, children }: { variant: "success" | "warning" | "danger" | "info" | "default"; children: React.ReactNode }) {
  const colors: Record<string, { color: string; border: string; bg?: string }> = {
    success: { color: "#000", border: "#000" },
    warning: { color: "#000", border: "#000", bg: "#f0f0f0" },
    danger: { color: "#ff0000", border: "#ff0000" },
    info: { color: "#000", border: "#000" },
    default: { color: "#666", border: "#ccc" },
  };
  const c = colors[variant] || colors.default;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, fontFamily: "'Space Mono', monospace", border: `1px solid ${c.border}`, color: c.color, background: c.bg || "transparent" }}>
      {children}
    </span>
  );
}

function Button({ variant = "primary", onClick, disabled, children, small }: { variant?: "primary" | "secondary" | "danger"; onClick: () => void; disabled?: boolean; children: React.ReactNode; small?: boolean }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "#000", color: "#fff", borderColor: "#000" },
    secondary: { background: "#fff", color: "#000", borderColor: "#000" },
    danger: { background: "#ff0000", color: "#fff", borderColor: "#ff0000" },
  };
  const s = styles[variant] || styles.primary;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: small ? "6px 12px" : "10px 20px",
        fontSize: small ? 11 : 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
        border: "3px solid", cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "'Space Mono', monospace", boxShadow: "2px 2px 0 0 #111",
        transition: "all 0.15s ease", opacity: disabled ? 0.5 : 1,
        ...s,
      }}
    >
      {children}
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{ background: "#fff", border: "3px solid #111", boxShadow: "8px 8px 0 0 #111", padding: 32, maxWidth: 480, width: "90%", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 12, borderBottom: "3px solid #111" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", fontWeight: 700 }}>×</button>
        </div>
        {children}
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
      const token = localStorage.getItem("ow_token") || "";
      const meRes = await fetch("/api/v1/auth/me", { headers: { Authorization: "Bearer " + token } });
      const meData = await meRes.json();
      if (meData.success) {
        setUser(meData.user);
        if (meData.user.tenantId) {
          const [agentsRes, keysRes, licensesRes] = await Promise.allSettled([
            fetch("/api/v1/edge/status", { headers: { Authorization: "Bearer " + token } }).then(r => r.json()),
            fetch("/api/v1/apikeys", { headers: { Authorization: "Bearer " + token } }).then(r => r.json()),
            fetch("/api/v1/licenses", { headers: { Authorization: "Bearer " + token } }).then(r => r.json()),
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const handleCreateLicense = async () => {
    setCreatingLicense(true);
    setLicenseError(null);
    try {
      const res = await fetch("/api/v1/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("ow_token") },
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
      const res = await fetch("/api/v1/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("ow_token") },
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
      const res = await fetch(`/api/v1/apikeys?id=${deleteKeyConfirm.id}`, { method: "DELETE", headers: { Authorization: "Bearer " + localStorage.getItem("ow_token") } });
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
      const res = await fetch(`/api/v1/licenses/${revokeLicenseConfirm.id}`, { method: "DELETE", headers: { Authorization: "Bearer " + localStorage.getItem("ow_token") } });
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <p style={{ fontSize: 24, fontWeight: 700, textTransform: "uppercase", fontFamily: "'Space Mono', monospace" }}>Cargando...</p>
      </div>
    );
  }

  if (!user) return null;

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
        <div style={{ marginBottom: 32, padding: "16px 20px", background: "rgba(255,100,100,0.1)", border: "3px solid #ff0000" }}>
          <strong style={{ textTransform: "uppercase" }}>Saldo Insuficiente</strong>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#555" }}>Tu balance de tokens está agotado. Contacta a tu administrador.</p>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#555", margin: 0 }}>Cada instalación autorizada. Revocar una elimina todas sus claves.</p>
          <Button onClick={() => setShowNewLicense(true)} disabled={licenseUsage.active >= licenseUsage.max}>
            + NUEVA LICENCIA
          </Button>
        </div>

        {licenseUsage.active >= licenseUsage.max && (
          <div style={{ padding: 12, background: "#fff0f0", border: "3px solid #ff0000", marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "#ff0000", margin: 0, fontWeight: 700 }}>Límite de instalaciones alcanzado. Actualizá tu plan para agregar más.</p>
          </div>
        )}

        {licenses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#888" }}>
            <p style={{ fontWeight: 700, textTransform: "uppercase", margin: "0 0 8px" }}>Sin licencias</p>
            <p style={{ fontSize: 13, margin: 0 }}>Creá tu primera instalación.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Nombre</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Estado</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Última Actividad</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Claves</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((lic) => (
                  <tr key={lic.id} style={{ borderBottom: "1px solid #e0e0e0" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>{lic.name}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <Badge variant={lic.status === "ACTIVE" ? "success" : "danger"}>
                        {lic.status}
                      </Badge>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {lic.lastSeenAt ? new Date(lic.lastSeenAt).toLocaleString() : "Nunca"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>{lic._count.apiKeys}</td>
                    <td style={{ padding: "12px 16px" }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#555", margin: 0 }}>Claves vinculadas a una licencia. Eliminar corta acceso inmediatamente.</p>
          <Button onClick={() => setShowNewKey(true)} disabled={activeLicenses.length === 0}>
            + NUEVA CLAVE
          </Button>
        </div>

        {activeLicenses.length === 0 && (
          <div style={{ padding: 12, background: "#f0f0f0", border: "3px solid #111", marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: "#555", margin: 0 }}>Creá una licencia primero para poder generar claves API.</p>
          </div>
        )}

        {apiKeys.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#888" }}>
            <p style={{ fontWeight: 700, textTransform: "uppercase", margin: "0 0 8px" }}>Sin claves activas</p>
            <p style={{ fontSize: 13, margin: 0 }}>Generá una clave para conectar tu agente.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Licencia</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Nombre</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Prefijo</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Último Uso</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.id} style={{ borderBottom: "1px solid #e0e0e0" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                      {key.license ? key.license.name : <span style={{ color: "#888" }}>Sin licencia</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>{key.name}</td>
                    <td style={{ padding: "12px 16px", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{key.keyPrefix}...</td>
                    <td style={{ padding: "12px 16px" }}>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Nunca"}</td>
                    <td style={{ padding: "12px 16px" }}>
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
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#888" }}>
            <p style={{ fontWeight: 700, textTransform: "uppercase", margin: "0 0 8px" }}>Sin agentes</p>
            <p style={{ fontSize: 13, margin: 0 }}>Configura tu agente con tu API Key.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Agente</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Host</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Plataforma</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} style={{ borderBottom: "1px solid #e0e0e0" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>{agent.agentName}</td>
                    <td style={{ padding: "12px 16px", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{agent.hostname}</td>
                    <td style={{ padding: "12px 16px" }}>{agent.platform}</td>
                    <td style={{ padding: "12px 16px" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 0 }}>
          <div style={{ border: "3px solid #111", padding: 24, boxShadow: "2px 2px 0 0 #111", transition: "all 0.15s ease", cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translate(-4px,-4px)"; e.currentTarget.style.boxShadow = "8px 8px 0 0 #111"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "2px 2px 0 0 #111"; }}
          >
            <p style={{ fontSize: 18, fontWeight: 700, textTransform: "uppercase", margin: "0 0 8px" }}>Descargar Desktop</p>
            <p style={{ fontSize: 13, color: "#555", margin: "0 0 16px" }}>App nativa para macOS, Windows, Linux</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <a href="/downloads/OmniWorker-Desktop.dmg" style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", fontFamily: "'Space Mono', monospace", background: "#000", color: "#fff", textDecoration: "none", border: "2px solid #000" }}>Mac</a>
              <a href="/downloads/OmniWorker-Desktop-Setup.exe" style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", fontFamily: "'Space Mono', monospace", background: "#000", color: "#fff", textDecoration: "none", border: "2px solid #000" }}>Windows</a>
              <a href="/downloads/OmniWorker-Desktop.AppImage" style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", fontFamily: "'Space Mono', monospace", background: "#fff", color: "#000", textDecoration: "none", border: "2px solid #000" }}>Linux</a>
            </div>
          </div>
          <div style={{ border: "3px solid #111", padding: 24, boxShadow: "2px 2px 0 0 #111" }}>
            <p style={{ fontSize: 18, fontWeight: 700, textTransform: "uppercase", margin: "0 0 8px" }}>Documentación</p>
            <p style={{ fontSize: 13, color: "#555", margin: 0 }}>Guías de instalación y configuración</p>
          </div>
        </div>
      </Section>

      {/* Platform Status */}
      <Section title="ESTADO DE PLATAFORMA">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
          <div style={{ borderRight: "3px solid #111" }}>
            <span style={{ color: "#555", fontSize: 13 }}>Plan</span><br />
            <strong style={{ fontSize: 16 }}>{(user.plan || "Free").toUpperCase()}</strong>
          </div>
          <div style={{ borderRight: "3px solid #111" }}>
            <span style={{ color: "#555", fontSize: 13 }}>Cuenta</span><br />
            <Badge variant={user.isLocked ? "danger" : "success"}>{user.isLocked ? "BLOQUEADA" : "ACTIVA"}</Badge>
          </div>
          <div>
            <span style={{ color: "#555", fontSize: 13 }}>Organización</span><br />
            <strong style={{ fontSize: 16 }}>{user.tenantName || "—"}</strong>
          </div>
        </div>
      </Section>

      {/* ── New License Modal ── */}
      {showNewLicense && (
        <Modal title="Nueva Instalación" onClose={() => setShowNewLicense(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>Nombre (opcional)</label>
              <input
                type="text"
                value={newLicenseName}
                onChange={e => setNewLicenseName(e.target.value)}
                placeholder="Ej: MacBook Pro Nelson"
                style={{ width: "100%", padding: "10px 12px", border: "3px solid #111", fontSize: 14, fontFamily: "'Space Mono', monospace", boxSizing: "border-box" }}
              />
            </div>
            {licenseError && (
              <div style={{ padding: 12, background: "#fff0f0", border: "3px solid #ff0000" }}>
                <p style={{ fontSize: 13, color: "#ff0000", margin: 0 }}>{licenseError}</p>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>Licencia *</label>
              <select
                value={selectedLicenseId}
                onChange={e => setSelectedLicenseId(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "3px solid #111", fontSize: 14, fontFamily: "'Space Mono', monospace", boxSizing: "border-box", background: "#fff" }}
              >
                <option value="">Seleccionar licencia...</option>
                {activeLicenses.map(lic => (
                  <option key={lic.id} value={lic.id}>{lic.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>Nombre (opcional)</label>
              <input
                type="text"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="Ej: Desktop Agent Key"
                style={{ width: "100%", padding: "10px 12px", border: "3px solid #111", fontSize: 14, fontFamily: "'Space Mono', monospace", boxSizing: "border-box" }}
              />
            </div>
            {keyError && (
              <div style={{ padding: 12, background: "#fff0f0", border: "3px solid #ff0000" }}>
                <p style={{ fontSize: 13, color: "#ff0000", margin: 0 }}>{keyError}</p>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
          <div style={{ padding: 16, background: "#FFC800", border: "3px solid #111", marginBottom: 16, boxShadow: "4px 4px 0 0 #111" }}>
            <p style={{ fontWeight: 700, fontSize: 16, margin: "0 0 8px" }}>⚠️ Copiá esta clave ahora!</p>
            <p style={{ fontSize: 13, color: "#333", margin: "0 0 8px" }}>
              Vinculada a: <strong>{newKeyLicense}</strong>. No se volverá a mostrar.
            </p>
            <code style={{ display: "block", background: "#111", color: "#fff", padding: 16, fontFamily: "'Space Mono', monospace", fontSize: 13, wordBreak: "break-all" }}>{newKeyRaw}</code>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={() => setNewKeyRaw(null)}>ENTENDIDO</Button>
          </div>
        </Modal>
      )}

      {/* ── Delete API Key Confirmation ── */}
      {deleteKeyConfirm && (
        <Modal title="Eliminar Clave API" onClose={() => setDeleteKeyConfirm(null)}>
          <div style={{ padding: 16, background: "#fff0f0", border: "3px solid #ff0000", marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 16, margin: "0 0 8px" }}>⚠️ Esta clave se eliminará inmediatamente.</p>
            <p style={{ fontSize: 14, color: "#333", margin: 0 }}>
              La app en ese computador perderá acceso a la plataforma.
            </p>
          </div>
          <p style={{ fontSize: 14, marginBottom: 16 }}>Clave: <strong>{deleteKeyConfirm.name}</strong></p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
          <div style={{ padding: 16, background: "#fff0f0", border: "3px solid #ff0000", marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 16, margin: "0 0 8px" }}>⚠️ Todas las claves de esta instalación serán eliminadas.</p>
            <p style={{ fontSize: 14, color: "#333", margin: 0 }}>
              Las apps en los computadores asociados perderán acceso inmediatamente.
            </p>
          </div>
          <p style={{ fontSize: 14, marginBottom: 16 }}>Instalación: <strong>{revokeLicenseConfirm.name}</strong></p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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