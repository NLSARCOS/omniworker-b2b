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
  isPlanExpired?: boolean;
  subscriptionEndsAt?: string | null;
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

/* ─── Design Tokens (matching landing page exactly) ─── */
/* ─── Editorial Components (same design system as landing page) ─── */

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      {/* Topbar — same as landing */}
      <div style={{ borderBottom: `1px solid var(--rule)`, paddingBottom: 10, marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>Panel de control · OmniWorker</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--neon-dim)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--neon)", display: "inline-block" }} />
          Asistente activo
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 24, borderBottom: `3px double var(--ink)` }}>
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon-dim)", background: "var(--neon-pale)", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16, borderLeft: `3px solid var(--neon)` }}>
            <span style={{ color: "var(--muted)" }}>§</span> Panel de control
          </div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 144, "SOFT" 30, "WONK" 0', fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, letterSpacing: "-0.04em", lineHeight: 0.93, margin: 0, color: "var(--ink)" }}>
            {title}
          </h1>
          <p style={{ fontSize: 16, color: "var(--muted)", marginTop: 12, fontFamily: "'Inter', sans-serif", fontWeight: 400, borderLeft: `3px solid var(--rule)`, paddingLeft: 16, lineHeight: 1.5 }}>{subtitle}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

function StatCard({ title, value, progress, subtitle }: { title: string; value: string | number; progress?: number; subtitle?: string }) {
  return (
    <div style={{ background: "var(--paper)", padding: 32, borderRight: `1px solid var(--rule)` }}>
      {/* Same as hero aside on landing */}
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--muted)", marginBottom: 12 }}>{title}</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 100, "WONK" 1', fontSize: 52, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--ink)", marginBottom: 6 }}>{value}</div>
      {progress !== undefined && (
        <>
          <div style={{ height: 3, background: "var(--rule)", overflow: "hidden", marginTop: 12 }}>
            <div style={{ height: "100%", width: `${Math.min(progress, 100)}%`, background: progress > 90 ? "var(--danger)" : "var(--neon)", transition: "width 0.6s ease" }} />
          </div>
          {subtitle && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>{subtitle}</div>}
        </>
      )}
    </div>
  );
}

function StatsGrid({ children }: { children: React.ReactNode }) {
  return (
    /* Same as hero aside layout on landing */
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 0, marginBottom: 40, border: `2px solid var(--ink)`, background: "var(--rule)" }}>
      {children}
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    /* Matches .section structure from landing page */
    <div id={id} style={{ marginBottom: 32, background: "var(--paper)", border: `1.5px solid var(--rule)`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "20px 28px", borderBottom: `1px solid var(--rule)`, background: "var(--paper-warm)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--neon-dim)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--muted)" }}>§</span>{title}
        </span>
      </div>
      <div style={{ padding: 28 }}>
        {children}
      </div>
    </div>
  );
}

function Badge({ variant, children }: { variant: "success" | "warning" | "danger" | "info" | "default"; children: React.ReactNode }) {
  const colors: Record<string, { color: string; border: string; bg: string }> = {
    success: { color: "var(--neon-dim)", border: "var(--neon)", bg: "var(--neon-pale)" },
    warning: { color: "#92400E", border: "#D97706", bg: "#FFFBEB" },
    danger:  { color: "var(--danger)",  border: "var(--danger)",  bg: "#FEF2F2" },
    info:    { color: "var(--ink)",     border: "var(--rule)",    bg: "var(--paper-warm)" },
    default: { color: "var(--muted)",  border: "var(--rule)",    bg: "var(--paper-warm)" },
  };
  const c = colors[variant] || colors.default;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'DM Mono', monospace", border: `1px solid ${c.border}`, color: c.color, background: c.bg, borderRadius: 100 }}>
      {children}
    </span>
  );
}

function Button({ variant = "primary", onClick, disabled, children, small }: { variant?: "primary" | "secondary" | "danger"; onClick: () => void; disabled?: boolean; children: React.ReactNode; small?: boolean }) {
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: "var(--ink)",    color: "var(--paper)", border: `1.5px solid var(--ink)` },
    secondary: { background: "var(--paper)",  color: "var(--ink)",   border: `1.5px solid var(--rule)` },
    danger:    { background: "#FEF2F2", color: "var(--danger)", border: `1.5px solid var(--danger)` },
  };
  const s = styles[variant] || styles.primary;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: small ? "6px 14px" : "10px 20px",
        fontSize: small ? 12 : 13, fontWeight: 600,
        borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "'Inter', sans-serif",
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
      position: "fixed", inset: 0, background: "rgba(13,13,13,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{ background: "var(--paper)", border: `1.5px solid var(--rule)`, borderRadius: 12, boxShadow: `6px 6px 0 var(--ink)`, padding: 32, maxWidth: 480, width: "90%", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 14, borderBottom: `1px solid var(--rule)` }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", margin: 0, color: "var(--ink)" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", fontWeight: 400, color: "var(--muted)", lineHeight: 1 }}>×</button>
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
  const [invoices, setInvoices] = useState<any[]>([]);
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
          const [agentsRes, keysRes, licensesRes, invoicesRes] = await Promise.allSettled([
            fetch("/api/v1/edge/status", { headers: { Authorization: "Bearer " + token } }).then(r => r.json()),
            fetch("/api/v1/apikeys", { headers: { Authorization: "Bearer " + token } }).then(r => r.json()),
            fetch("/api/v1/licenses", { headers: { Authorization: "Bearer " + token } }).then(r => r.json()),
            fetch("/api/v1/invoices", { headers: { Authorization: "Bearer " + token } }).then(r => r.json()),
          ]);
          if (agentsRes.status === "fulfilled" && agentsRes.value?.success) setAgents(agentsRes.value.agents || []);
          if (keysRes.status === "fulfilled" && keysRes.value?.success) setApiKeys(keysRes.value.keys || []);
          if (licensesRes.status === "fulfilled" && licensesRes.value?.success) {
            setLicenses(licensesRes.value.licenses || []);
            setLicenseUsage(licensesRes.value.usage || { active: 0, max: 1 });
          }
          if (invoicesRes.status === "fulfilled" && invoicesRes.value?.success) {
            setInvoices(invoicesRes.value.invoices || []);
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 80, "SOFT" 30', fontSize: 32, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.02em" }}>Cargando...</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)" }}>Verificando acceso</div>
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
      {user.isPlanExpired && (
        <div style={{ marginBottom: 28, padding: "16px 20px", background: "#FEF2F2", border: `1.5px solid var(--danger)`, borderRadius: 8 }}>
          <strong style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--danger)" }}>⚠️ Plan de suscripción expirado</strong>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ink-soft)", fontWeight: 400, lineHeight: 1.6 }}>Tu plan de OmniWorker ha vencido. Ponte en contacto con tu administrador para registrar un nuevo pago y reactivar tu cuenta.</p>
        </div>
      )}

      {user.isLocked && !user.isPlanExpired && (
        <div style={{ marginBottom: 28, padding: "16px 20px", background: "#FEF2F2", border: `1.5px solid var(--danger)`, borderRadius: 8 }}>
          <strong style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--danger)" }}>Saldo de tokens agotado</strong>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ink-soft)", fontWeight: 400 }}>Tu balance de tokens está agotado. Contactá a tu administrador.</p>
        </div>
      )}

      {/* Stats */}
      <StatsGrid>
        <StatCard title="Tokens Disponibles" value={user.tokenBalance.toLocaleString()} progress={tokenPct} subtitle={`${tokenPct}% restante`} />
        <StatCard title="Plan" value={(user.plan || "Free").toUpperCase()} />
        <StatCard title="Instalaciones" value={`${licenseUsage.active} / ${licenseUsage.max}`} progress={(licenseUsage.active / Math.max(licenseUsage.max, 1)) * 100} />
      </StatsGrid>

      {/* Licenses / Instalaciones */}
      <Section title={`Instalaciones — ${licenseUsage.active} / ${licenseUsage.max}`} id="licenses">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, fontWeight: 400 }}>Cada instalación autorizada. Revocar una elimina todas sus claves de acceso.</p>
          <Button onClick={() => setShowNewLicense(true)} disabled={licenseUsage.active >= licenseUsage.max}>
            + Nueva instalación
          </Button>
        </div>

        {licenseUsage.active >= licenseUsage.max && (
          <div style={{ padding: "12px 16px", background: "#FEF2F2", border: `1.5px solid var(--danger)`, marginBottom: 16, borderRadius: 6 }}>
            <p style={{ fontSize: 13, color: "var(--danger)", margin: 0, fontWeight: 600 }}>Límite de instalaciones alcanzado. Actualizá tu plan para agregar más.</p>
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
      <Section title="Claves de acceso" id="keys">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, fontWeight: 400 }}>Claves vinculadas a una instalación. Eliminar corta el acceso de inmediato.</p>
          <Button onClick={() => setShowNewKey(true)} disabled={activeLicenses.length === 0}>
            + Nueva clave
          </Button>
        </div>

        {activeLicenses.length === 0 && (
          <div style={{ padding: "12px 16px", background: "var(--paper-warm)", border: `1px solid var(--rule)`, marginBottom: 16, borderRadius: 6 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, fontWeight: 500 }}>Creá una instalación primero para poder generar claves de acceso.</p>
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
      <Section title="Asistentes conectados" id="agents">
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
      <Section title="Descargas" id="actions">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <div style={{ border: `1.5px solid var(--rule)`, borderRadius: 10, padding: 24, background: "var(--paper-warm)", transition: "all 0.15s ease" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 6px" }}>Descargar app de escritorio</div>
            <div style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", fontWeight: 400 }}>App nativa para macOS, Windows, Linux — v0.4.3</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <a href="/api/downloads/omniworker-desktop-0.4.3-arm64.dmg" style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "var(--ink)", color: "var(--paper)", textDecoration: "none", borderRadius: 6 }}>🍎 Mac (Apple Silicon)</a>
              <a href="/api/downloads/omniworker-desktop-0.4.3-setup.exe" style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "var(--ink)", color: "var(--paper)", textDecoration: "none", borderRadius: 6 }}>🪟 Windows</a>
              <a href="/api/downloads/omniworker-desktop-0.4.3.AppImage" style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "var(--paper)", color: "var(--ink)", textDecoration: "none", borderRadius: 6, border: `1px solid var(--rule)` }}>🐧 Linux</a>
            </div>
          </div>
          <div style={{ border: `1.5px solid var(--rule)`, borderRadius: 10, padding: 24, background: "var(--paper-warm)" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--ink)", margin: "0 0 6px" }}>Documentación</div>
            <div style={{ fontSize: 13, color: "var(--muted)", margin: 0, fontWeight: 400 }}>Guías de instalación y configuración del asistente</div>
          </div>
        </div>
      </Section>

      {/* Historial de Facturación */}
      <Section title="Historial de facturación" id="billing">
        {invoices.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#888" }}>
            <p style={{ fontWeight: 700, textTransform: "uppercase", margin: "0 0 8px" }}>Sin facturas</p>
            <p style={{ fontSize: 13, margin: 0 }}>No hay cobros o pagos manuales registrados en tu cuenta.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Factura</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Fecha Pago</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Concepto</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Monto</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, borderBottom: "3px solid #111", fontFamily: "'Space Mono', monospace" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #e0e0e0" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: "12px 16px" }}>{new Date(inv.paidAt).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 16px" }}>{inv.description || "Pago de suscripción manual"}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 700 }}>${inv.amount.toFixed(2)} USD</td>
                    <td style={{ padding: "12px 16px" }}>
                      <Badge variant="success">PAGADO</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Platform Status */}
      <Section title="Estado de la cuenta">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 0, border: `1px solid var(--rule)`, borderRadius: 8, overflow: "hidden" }}>
          {[
            { label: "Plan", value: (user.plan || "Free").toUpperCase() },
            { label: "Estado", value: <Badge variant={user.isPlanExpired ? "danger" : "success"}>{user.isPlanExpired ? "Expirada" : "Activa"}</Badge> },
            { label: "Vencimiento", value: user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toLocaleDateString() : "Sin fecha límite" },
            { label: "Organización", value: user.tenantName || "—" },
          ].map((item, i) => (
            <div key={item.label} style={{ padding: "20px 24px", borderRight: i < 3 ? `1px solid var(--rule)` : "none", background: "var(--paper-warm)" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--muted)", marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 48', fontSize: 18, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.01em" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── New License Modal ── */}
      {showNewLicense && (
        <Modal title="Nueva instalación" onClose={() => setShowNewLicense(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>Nombre (opcional)</label>
              <input
                type="text"
                value={newLicenseName}
                onChange={e => setNewLicenseName(e.target.value)}
                placeholder="Ej: MacBook Pro Nelson"
                style={{ width: "100%", padding: "10px 14px", border: `1.5px solid var(--rule)`, borderRadius: 6, fontSize: 14, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", background: "var(--paper-warm)", color: "var(--ink)", outline: "none" }}
              />
            </div>
            {licenseError && (
              <div style={{ padding: "10px 14px", background: "#FEF2F2", border: `1px solid var(--danger)`, borderRadius: 6 }}>
                <p style={{ fontSize: 13, color: "var(--danger)", margin: 0, fontWeight: 500 }}>{licenseError}</p>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowNewLicense(false)}>Cancelar</Button>
              <Button onClick={handleCreateLicense} disabled={creatingLicense}>
                {creatingLicense ? "Creando..." : "Crear instalación"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── New API Key Modal ── */}
      {showNewKey && (
        <Modal title="Nueva clave de acceso" onClose={() => setShowNewKey(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>Instalación *</label>
              <select
                value={selectedLicenseId}
                onChange={e => setSelectedLicenseId(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", border: `1.5px solid var(--rule)`, borderRadius: 6, fontSize: 14, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", background: "var(--paper-warm)", color: "var(--ink)" }}
              >
                <option value="">Seleccionar instalación...</option>
                {activeLicenses.map(lic => (
                  <option key={lic.id} value={lic.id}>{lic.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>Nombre (opcional)</label>
              <input
                type="text"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="Ej: Desktop Agent Key"
                style={{ width: "100%", padding: "10px 14px", border: `1.5px solid var(--rule)`, borderRadius: 6, fontSize: 14, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", background: "var(--paper-warm)", color: "var(--ink)" }}
              />
            </div>
            {keyError && (
              <div style={{ padding: "10px 14px", background: "#FEF2F2", border: `1px solid var(--danger)`, borderRadius: 6 }}>
                <p style={{ fontSize: 13, color: "var(--danger)", margin: 0, fontWeight: 500 }}>{keyError}</p>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowNewKey(false)}>Cancelar</Button>
              <Button onClick={handleGenerateKey} disabled={generatingKey || !selectedLicenseId}>
                {generatingKey ? "Generando..." : "Generar clave"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── One-time raw key display ── */}
      {newKeyRaw && (
        <Modal title="Tu nueva clave de acceso" onClose={() => setNewKeyRaw(null)}>
          <div style={{ padding: 16, background: "var(--neon-pale)", border: `1.5px solid var(--neon)`, marginBottom: 16, borderRadius: 8 }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 8px", color: "var(--ink)" }}>⚠️ Copiá esta clave ahora</p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px", fontWeight: 400 }}>
              Vinculada a: <strong style={{ color: "var(--ink)" }}>{newKeyLicense}</strong>. No se volverá a mostrar.
            </p>
            <code style={{ display: "block", background: "var(--ink)", color: "var(--neon)", padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 13, wordBreak: "break-all", borderRadius: 6 }}>{newKeyRaw}</code>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={() => setNewKeyRaw(null)}>Entendido</Button>
          </div>
        </Modal>
      )}

      {/* ── Delete API Key Confirmation ── */}
      {deleteKeyConfirm && (
        <Modal title="Eliminar clave de acceso" onClose={() => setDeleteKeyConfirm(null)}>
          <div style={{ padding: "12px 16px", background: "#FEF2F2", border: `1px solid var(--danger)`, marginBottom: 16, borderRadius: 6 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 6px", color: "var(--danger)" }}>⚠️ Esta clave se eliminará de inmediato.</p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, fontWeight: 400 }}>La aplicación en ese computador perderá acceso a la plataforma.</p>
          </div>
          <p style={{ fontSize: 14, marginBottom: 16, color: "var(--ink-soft)" }}>Clave: <strong style={{ color: "var(--ink)" }}>{deleteKeyConfirm.name}</strong></p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setDeleteKeyConfirm(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDeleteKey} disabled={deletingKey}>
              {deletingKey ? "Eliminando..." : "Eliminar definitivamente"}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Revoke License Confirmation ── */}
      {revokeLicenseConfirm && (
        <Modal title="Revocar instalación" onClose={() => setRevokeLicenseConfirm(null)}>
          <div style={{ padding: "12px 16px", background: "#FEF2F2", border: `1px solid var(--danger)`, marginBottom: 16, borderRadius: 6 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 6px", color: "var(--danger)" }}>⚠️ Todas las claves de esta instalación serán eliminadas.</p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, fontWeight: 400 }}>Las aplicaciones en los computadores asociados perderán acceso de inmediato.</p>
          </div>
          <p style={{ fontSize: 14, marginBottom: 16, color: "var(--ink-soft)" }}>Instalación: <strong style={{ color: "var(--ink)" }}>{revokeLicenseConfirm.name}</strong></p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setRevokeLicenseConfirm(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleRevokeLicense} disabled={revokingLicense}>
              {revokingLicense ? "Revocando..." : "Revocar definitivamente"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}