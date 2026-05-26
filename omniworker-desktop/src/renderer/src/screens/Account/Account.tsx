import { useState, useEffect } from "react";
import { useI18n } from "../../components/useI18n";
import { Copy, Refresh, KeyRound, Users, Check } from "../../assets/icons";
import { 
  Shield, 
  Terminal as TerminalIcon, 
  LogOut, 
  Cpu, 
  Laptop, 
  Server, 
  Activity,
  Database
} from "lucide-react";

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

interface EdgeAgent {
  id: string;
  agentName: string;
  hostname: string;
  platform: string;
  status: string;
  lastSeenAt: string;
}

interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface LicenseData {
  id: string;
  name: string;
  status: string;
  deviceFingerprint: string | null;
  lastSeenAt: string | null;
  tokenBalance: number;
}

interface AccountProps {
  userData?: any;
  authToken?: string | null;
  onLogout?: () => void;
}

function normalizeUser(raw: any): UserData {
  return {
    id: raw.id || "",
    email: raw.email || "",
    name: raw.name || null,
    role: raw.role || "USER",
    tenantId: raw.tenantId || null,
    tenantName: raw.tenantName || null,
    tokenBalance: raw.tokenBalance ?? 0,
    plan: raw.plan || null,
    isLocked: raw.isLocked ?? false,
  };
}

export default function Account({
  userData: loginData,
  authToken,
  onLogout,
}: AccountProps) {
  const { t } = useI18n();
  const [user, setUser] = useState<UserData | null>(null);
  const [agents, setAgents] = useState<EdgeAgent[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [licenses, setLicenses] = useState<LicenseData[]>([]);
  const [licenseUsage, setLicenseUsage] = useState({ active: 0, max: 1 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const saasUrl = import.meta.env.VITE_SAAS_URL || "https://flux.simplex.lat";

  // Build initial user from login data
  useEffect(() => {
    if (loginData) setUser(normalizeUser(loginData));
  }, [loginData]);

  function getHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) h["Authorization"] = `Bearer ${authToken}`;
    return h;
  }

  async function fetchAccountData() {
    if (!authToken) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const headers = getHeaders();

      let fingerprint = "";
      let deviceName = "";
      try {
        fingerprint = await window.omniworkerAPI.getDeviceFingerprint();
        deviceName = await window.omniworkerAPI.getDeviceName();
      } catch (e) {
        console.error("[Account] Failed to get device info:", e);
      }

      const licensesUrl = fingerprint
        ? `${saasUrl}/api/v1/licenses?deviceFingerprint=${encodeURIComponent(fingerprint)}&deviceName=${encodeURIComponent(deviceName)}`
        : `${saasUrl}/api/v1/licenses`;

      const [meRes, agentsRes, keysRes, licensesRes] = await Promise.all([
        fetch(`${saasUrl}/api/v1/auth/me`, { headers }).catch(() => null),
        fetch(`${saasUrl}/api/v1/edge/status`, { headers }).catch(() => null),
        fetch(`${saasUrl}/api/v1/apikeys`, { headers }).catch(() => null),
        fetch(licensesUrl, { headers }).catch(() => null),
      ]);

      if (meRes) {
        const meData = await meRes.json().catch(() => null);
        if (meData?.success && meData.user) setUser(normalizeUser(meData.user));
      }

      if (agentsRes) {
        const agentsData = await agentsRes.json().catch(() => null);
        if (agentsData?.success) setAgents(agentsData.agents || []);
      }

      if (keysRes) {
        const keysData = await keysRes.json().catch(() => null);
        if (keysData?.success) setApiKeys(keysData.keys || []);
      }

      if (licensesRes) {
        if (licensesRes.status === 401 && onLogout) {
          console.warn("[Account] Device has been revoked. Triggering logout.");
          onLogout();
          return;
        }
        const licData = await licensesRes.json().catch(() => null);
        if (licData?.success) {
          setLicenses(licData.licenses || []);
          setLicenseUsage(licData.usage || { active: 0, max: 1 });
        }
      }
    } catch {
      // Use login data as fallback — already set via useEffect
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchAccountData();
  }, [authToken]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAccountData();
  };

  const handleCopyApiKey = () => {
    window.omniworkerAPI.getEnv().then((e: any) => {
      const key = e?.CUSTOM_API_KEY;
      if (key) {
        navigator.clipboard.writeText(key);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  };

  const displayUser = user || (loginData ? normalizeUser(loginData) : null);

  const [isValidating, setIsValidating] = useState(false);
  const [validationOutput, setValidationOutput] = useState<string | null>(null);

  const runValidation = async () => {
    setIsValidating(true);
    setValidationOutput(
      "Initializing diagnostics...\n[SYSTEM] Connecting to local gateway daemon...\n[SYSTEM] Resolving routing graphs...\n[SYSTEM] Loading AI configurations..."
    );
    try {
      const isGateway = await window.omniworkerAPI.gatewayStatus();
      const isRouter = await window.omniworkerAPI.smartRouterStatus();
      const doctorOutput = await window.omniworkerAPI.runOmniWorkerDoctor();
      setValidationOutput(
        `--- Service Status ---\nGateway Running: ${isGateway ? "ONLINE" : "OFFLINE"}\nSmart Router Running: ${isRouter ? "ONLINE" : "OFFLINE"}\n\n--- OmniWorker Doctor Output ---\n${doctorOutput}`
      );
    } catch (err: any) {
      setValidationOutput("Error during validation: " + err.message);
    } finally {
      setIsValidating(false);
    }
  };

  if (loading && !displayUser) {
    return (
      <div className="account-screen">
        <div className="account-loading">
          <div className="loading-spinner" style={{ borderTopColor: "var(--accent)" }} />
          <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "12px", marginTop: "12px" }}>
            {t("common.loading") || "Loading secure session..."}
          </p>
        </div>
      </div>
    );
  }

  if (!displayUser) {
    return (
      <div className="account-screen">
        <div className="account-loading">
          <Shield size={36} color="var(--error)" />
          <p style={{ color: "var(--error)", fontFamily: "var(--font-mono)", fontWeight: "bold" }}>
            No secure session found
          </p>
        </div>
      </div>
    );
  }

  const tokenPercent =
    displayUser.tokenBalance > 0
      ? Math.min(100, (displayUser.tokenBalance / 100000) * 100)
      : 0;
  const tokenBarColor =
    displayUser.tokenBalance > 50000
      ? "var(--success)"
      : displayUser.tokenBalance > 10000
        ? "var(--warning)"
        : "var(--error)";

  // Initial letter of user name or email for avatar
  const avatarLetter = (displayUser.name || displayUser.email || "U").charAt(0).toUpperCase();

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes("mac") || p.includes("darwin")) return <Laptop size={14} className="text-blue-400" />;
    if (p.includes("win")) return <Laptop size={14} className="text-teal-400" />;
    if (p.includes("linux")) return <Cpu size={14} className="text-yellow-400" />;
    return <Server size={14} />;
  };

  return (
    <div className="account-screen" style={{ background: "transparent" }}>
      {/* Screen Title */}
      <div className="account-header" style={{ marginBottom: "20px" }}>
        <h1 className="account-title" style={{ margin: 0 }}>
          <Shield size={24} style={{ color: "var(--accent)" }} />
          {t("account.title") || "OmniWorker Profile"}
        </h1>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            className={`account-refresh-btn ${refreshing ? "spinning" : ""}`}
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ borderRadius: "50%", padding: "8px", background: "rgba(255,255,255,0.03)" }}
            title={t("common.refresh") || "Refresh profile"}
          >
            <Refresh size={15} />
          </button>
        </div>
      </div>

      {/* Grid Dashboard */}
      <div className="ow-dashboard-grid">
        
        {/* Left Column: Avatar & Core Profile */}
        <div className="account-card" style={{ padding: "24px", textAlign: "center" }}>
          <div className="futuristic-avatar-container">
            <div className="futuristic-avatar">
              {avatarLetter}
            </div>
            <div className="avatar-glow" />
            <div className="avatar-status-badge" />
          </div>

          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "12px 0 4px 0", color: "var(--text-primary)" }}>
            {displayUser.name || "Default User"}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px 0", fontFamily: "var(--font-mono)" }}>
            {displayUser.email}
          </p>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
            <span className="ow-badge-modern">
              {displayUser.role}
            </span>
          </div>

          {/* User Details */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px", textAlign: "left" }}>
            <div className="ow-stat-row-modern">
              <span className="ow-stat-label-modern">
                <Server size={14} style={{ opacity: 0.6 }} />
                {t("account.organization") || "Organization"}
              </span>
              <span className="ow-stat-value-modern" style={{ color: "var(--accent)" }}>
                {displayUser.tenantName || "Personal"}
              </span>
            </div>
            <div className="ow-stat-row-modern">
              <span className="ow-stat-label-modern">
                <Activity size={14} style={{ opacity: 0.6 }} />
                ID
              </span>
              <span className="ow-stat-value-modern" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {displayUser.id.substring(0, 8)}...
              </span>
            </div>
          </div>

          {/* Logout button */}
          {onLogout && (
            <button
              className="btn btn-ghost"
              onClick={onLogout}
              style={{
                width: "100%",
                marginTop: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px",
                color: "#f87171",
                background: "rgba(239, 68, 68, 0.05)",
                borderColor: "rgba(239, 68, 68, 0.15)"
              }}
            >
              <LogOut size={14} />
              Cerrar Sesión
            </button>
          )}
        </div>

        {/* Right Column: Widgets, Agents, Keys */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Quick Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            
            {/* Tokens Widget */}
            <div className="ow-capacity-widget" style={{ margin: 0 }}>
              <div className="ow-capacity-header">
                <span className="ow-capacity-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Database size={13} style={{ color: "var(--accent)" }} />
                  {t("account.tokens") || "Token Balance"}
                </span>
                <span className="ow-capacity-value" style={{ color: tokenBarColor, fontWeight: "bold" }}>
                  {displayUser.tokenBalance.toLocaleString()}
                </span>
              </div>
              <div className="ow-capacity-bar-container">
                <div
                  className="ow-capacity-bar-fill"
                  style={{
                    width: `${tokenPercent}%`,
                    backgroundColor: tokenBarColor,
                  }}
                />
              </div>
              {displayUser.isLocked && (
                <p style={{ color: "var(--error)", fontSize: "11px", margin: "6px 0 0 0", fontFamily: "var(--font-mono)" }}>
                  {t("account.locked") || "Depleted — contact admin"}
                </p>
              )}
            </div>

            {/* Plan widget */}
            <div className="account-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Active Plan
              </span>
              <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                {displayUser.plan || "Free Tier"}
                <span className="ow-badge-modern" style={{ fontSize: "9px" }}>PRO</span>
              </span>
            </div>

            {/* Licencias widget */}
            <div className="account-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Equipos Licenciados
              </span>
              <span style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
                {licenseUsage.active} / {licenseUsage.max}
                <span className="ow-badge-modern" style={{ fontSize: "9px" }}>B2B</span>
              </span>
            </div>

          </div>

          {/* Connected Agents Card */}
          <div className="account-card">
            <div className="account-card-header">
              <h2>
                <Users size={15} style={{ color: "var(--accent)" }} />
                {t("account.edgeAgents") || "Active Edge Nodes"}
                <span className="ow-tag-pill" style={{ marginLeft: "auto", fontSize: "10px" }}>
                  {agents.length} Nodes
                </span>
              </h2>
            </div>
            <div style={{ padding: "16px" }}>
              {agents.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: 0, textAlign: "center", padding: "12px 0" }}>
                  {t("account.noAgents") || "No connected desktop/server edge agents."}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {agents.map((agent) => (
                    <div
                      key={agent.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "rgba(255,255,255,0.01)",
                        border: "1px solid rgba(255,255,255,0.03)",
                        borderRadius: "8px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ padding: "8px", background: "rgba(255,255,255,0.03)", borderRadius: "6px" }}>
                          {getPlatformIcon(agent.platform)}
                        </div>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                            {agent.agentName}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {agent.hostname} &middot; {agent.platform}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`ow-badge-modern`}
                        style={{
                          background: agent.status.toLowerCase() === "online" ? "rgba(16, 185, 129, 0.08)" : "rgba(255,255,255,0.05)",
                          borderColor: agent.status.toLowerCase() === "online" ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.08)",
                          color: agent.status.toLowerCase() === "online" ? "#10b981" : "var(--text-muted)",
                        }}
                      >
                        {agent.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active B2B Licenses Card */}
          <div className="account-card">
            <div className="account-card-header">
              <h2>
                <Laptop size={15} style={{ color: "var(--accent)" }} />
                Licencias de Equipos / Instalaciones
                <span className="ow-tag-pill" style={{ marginLeft: "auto", fontSize: "10px" }}>
                  {licenseUsage.active} / {licenseUsage.max} Activas
                </span>
              </h2>
            </div>
            <div style={{ padding: "16px" }}>
              {licenses.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: 0, textAlign: "center", padding: "12px 0" }}>
                  Sin licencias registradas en esta cuenta B2B.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {licenses.map((lic) => (
                    <div
                      key={lic.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "rgba(255,255,255,0.01)",
                        border: "1px solid rgba(255,255,255,0.03)",
                        borderRadius: "8px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ padding: "8px", background: "rgba(255,255,255,0.03)", borderRadius: "6px" }}>
                          <Laptop size={14} style={{ color: lic.status === "ACTIVE" ? "#10b981" : "#f87171" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                            {lic.name}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {lic.deviceFingerprint ? `Fingerprint: ${lic.deviceFingerprint.substring(0, 8)}...` : "Browser / Web"} &middot; {lic.lastSeenAt ? `Visto: ${new Date(lic.lastSeenAt).toLocaleString()}` : "Nunca visto"} &middot; <span style={{ color: "var(--accent)", fontWeight: "bold" }}>{(lic.tokenBalance ?? 0).toLocaleString()} tokens</span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`ow-badge-modern`}
                        style={{
                          background: lic.status === "ACTIVE" ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                          borderColor: lic.status === "ACTIVE" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                          color: lic.status === "ACTIVE" ? "#10b981" : "#f87171",
                        }}
                      >
                        {lic.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* API Keys Card */}
          <div className="account-card">
            <div className="account-card-header">
              <h2>
                <KeyRound size={15} style={{ color: "var(--accent)" }} />
                {t("account.apiKeys") || "Secure Access Tokens"}
              </h2>
            </div>
            <div style={{ padding: "16px" }}>
              {apiKeys.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 16px 0", textAlign: "center" }}>
                  {t("account.noKeys") || "No API access keys have been generated."}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                  {apiKeys.map((key) => (
                    <div
                      key={key.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "rgba(255,255,255,0.01)",
                        border: "1px solid rgba(255,255,255,0.03)",
                        borderRadius: "8px"
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {key.name}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {key.keyPrefix}... &middot; Created {new Date(key.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {key.lastUsedAt
                          ? `Used: ${new Date(key.lastUsedAt).toLocaleDateString()}`
                          : "Never used"}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                className="btn btn-secondary"
                onClick={handleCopyApiKey}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "10px"
                }}
              >
                {copied ? <Check size={14} style={{ color: "#10b981" }} /> : <Copy size={14} />}
                {copied
                  ? t("common.copied") || "Key Copied to Clipboard!"
                  : t("account.copyKey") || "Copy Current Active API Key"}
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* System Validation Panel (Diagnostics) */}
      <div className="account-card" style={{ marginTop: "24px" }}>
        <div className="account-card-header">
          <h2>
            <TerminalIcon size={15} style={{ color: "var(--accent)" }} />
            {t("account.systemValidation") || "System Diagnostics & Services"}
          </h2>
        </div>
        <div style={{ padding: "16px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 16px 0" }}>
            Perform verification passes across local agent loops, network endpoints, and model gateways to ensure standard operation.
          </p>
          
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={runValidation}
              disabled={isValidating}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Activity size={14} />
              {isValidating ? "Diagnostic Running..." : "Run Diagnostic Check"}
            </button>
            
            <button
              className="btn btn-secondary"
              onClick={async () => {
                setValidationOutput(
                  "[MUTATION] Initializing component validation and missing tool installations..."
                );
                try {
                  const res = await window.omniworkerAPI.startInstall(
                    authToken || undefined,
                  );
                  if (res.success) {
                    setValidationOutput(
                      "[SYSTEM] Component alignment finalized! Diagnostics show clean parameters. Run check again."
                    );
                  } else {
                    setValidationOutput("[ERROR] Repair script aborted: " + res.error);
                  }
                } catch (err: any) {
                  setValidationOutput(
                    "[ERROR] Uncaught exception during build pass: " + err.message
                  );
                }
              }}
              disabled={isValidating}
            >
              Align & Reinstall Missing Components
            </button>
          </div>

          {/* Diagnostics Terminal Console */}
          {validationOutput && (
            <div className="futuristic-terminal">
              <div className="terminal-header">
                <div className="terminal-dots">
                  <div className="terminal-dot-red" />
                  <div className="terminal-dot-yellow" />
                  <div className="terminal-dot-green" />
                </div>
                <span>Terminal Diagnostics Console</span>
              </div>
              <pre className="terminal-log-content">{validationOutput}</pre>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
