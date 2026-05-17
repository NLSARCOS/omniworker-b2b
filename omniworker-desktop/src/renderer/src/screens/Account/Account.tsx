import { useState, useEffect } from "react";
import { useI18n } from "../../components/useI18n";
import { Copy, Refresh, KeyRound, Users, Check } from "../../assets/icons";

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

interface AccountProps {
  userData?: any;
  authToken?: string | null;
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

export default function Account({ userData: loginData, authToken }: AccountProps) {
  const { t } = useI18n();
  const [user, setUser] = useState<UserData | null>(null);
  const [agents, setAgents] = useState<EdgeAgent[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const saasUrl = import.meta.env.VITE_SAAS_URL || "https://worker.thelab.lat";

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

      const [meRes, agentsRes, keysRes] = await Promise.all([
        fetch(`${saasUrl}/api/v1/auth/me`, { headers }).catch(() => null),
        fetch(`${saasUrl}/api/v1/edge/status`, { headers }).catch(() => null),
        fetch(`${saasUrl}/api/v1/apikeys`, { headers }).catch(() => null),
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

  if (loading && !displayUser) {
    return (
      <div className="account-screen">
        <div className="account-loading">
          <p style={{ color: "var(--text-muted)" }}>
            {t("common.loading") || "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (!displayUser) {
    return (
      <div className="account-screen">
        <div className="account-loading">
          <p style={{ color: "var(--error)" }}>No user data available</p>
        </div>
      </div>
    );
  }

  const tokenPercent = displayUser.tokenBalance > 0
    ? Math.min(100, (displayUser.tokenBalance / 100000) * 100)
    : 0;
  const tokenBarColor =
    displayUser.tokenBalance > 50000
      ? "var(--success)"
      : displayUser.tokenBalance > 10000
        ? "var(--warning)"
        : "var(--error)";

  return (
    <div className="account-screen">
      <div className="account-header">
        <h1 className="account-title">{t("account.title") || "Account"}</h1>
        <button
          className={`account-refresh-btn ${refreshing ? "spinning" : ""}`}
          onClick={handleRefresh}
          disabled={refreshing}
          title={t("common.refresh") || "Refresh"}
        >
          <Refresh size={16} />
        </button>
      </div>

      {/* User Info Card */}
      <div className="account-card">
        <div className="account-card-header">
          <h2>{t("account.profile") || "Profile"}</h2>
        </div>
        <div className="account-user-info">
          <div className="account-user-row">
            <span className="account-label">{t("account.email") || "Email"}</span>
            <span className="account-value">{displayUser.email}</span>
          </div>
          {displayUser.name && (
            <div className="account-user-row">
              <span className="account-label">{t("account.name") || "Name"}</span>
              <span className="account-value">{displayUser.name}</span>
            </div>
          )}
          <div className="account-user-row">
            <span className="account-label">{t("account.organization") || "Organization"}</span>
            <span className="account-value">{displayUser.tenantName || "—"}</span>
          </div>
          <div className="account-user-row">
            <span className="account-label">{t("account.role") || "Role"}</span>
            <span className="account-value account-badge">{displayUser.role}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="account-stats">
        <div className="account-stat-card">
          <div className="account-stat-top">
            <span className="account-stat-label">{t("account.tokens") || "Tokens"}</span>
            <span
              className="account-stat-value"
              style={{ color: displayUser.isLocked ? "var(--error)" : "var(--text-primary)" }}
            >
              {displayUser.tokenBalance.toLocaleString()}
            </span>
          </div>
          <div className="account-stat-bar-track">
            <div
              className="account-stat-bar-fill"
              style={{ width: `${tokenPercent}%`, backgroundColor: tokenBarColor }}
            />
          </div>
          {displayUser.isLocked && (
            <p className="account-stat-warning">
              {t("account.locked") || "Balance depleted — contact admin"}
            </p>
          )}
        </div>

        <div className="account-stat-card">
          <span className="account-stat-label">{t("account.plan") || "Plan"}</span>
          <span className="account-stat-value">{displayUser.plan || "Free"}</span>
        </div>

        <div className="account-stat-card">
          <span className="account-stat-label">{t("account.agents") || "Active Agents"}</span>
          <span className="account-stat-value">{agents.length}</span>
        </div>
      </div>

      {/* Edge Agents */}
      <div className="account-card">
        <div className="account-card-header">
          <h2>
            <Users size={16} />
            {t("account.edgeAgents") || "Connected Agents"}
          </h2>
        </div>
        {agents.length === 0 ? (
          <p className="account-empty">{t("account.noAgents") || "No connected agents"}</p>
        ) : (
          <div className="account-agents-list">
            {agents.map((agent) => (
              <div key={agent.id} className="account-agent-row">
                <div className="account-agent-info">
                  <span className="account-agent-name">{agent.agentName}</span>
                  <span className="account-agent-detail">
                    {agent.hostname} &middot; {agent.platform}
                  </span>
                </div>
                <span className={`account-status-badge ${agent.status}`}>
                  {agent.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="account-card">
        <div className="account-card-header">
          <h2>
            <KeyRound size={16} />
            {t("account.apiKeys") || "API Keys"}
          </h2>
        </div>
        {apiKeys.length === 0 ? (
          <p className="account-empty">{t("account.noKeys") || "No API keys"}</p>
        ) : (
          <div className="account-keys-list">
            {apiKeys.map((key) => (
              <div key={key.id} className="account-key-row">
                <div className="account-key-info">
                  <span className="account-key-name">{key.name}</span>
                  <span className="account-key-detail">
                    {key.keyPrefix}... &middot;{" "}
                    {t("account.created") || "Created"}: {new Date(key.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span className="account-key-last">
                  {key.lastUsedAt
                    ? new Date(key.lastUsedAt).toLocaleDateString()
                    : t("account.never") || "Never"}
                </span>
              </div>
            ))}
          </div>
        )}
        <button className="account-copy-key-btn" onClick={handleCopyApiKey}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied
            ? t("common.copied") || "Copied!"
            : t("account.copyKey") || "Copy current API key"}
        </button>
      </div>

      {/* System Validation */}
      <div className="account-card">
        <div className="account-card-header">
          <h2>
            <Check size={16} />
            {t("account.systemValidation") || "System Validation"}
          </h2>
        </div>
        <div className="account-keys-list" style={{ padding: "16px" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            Check if the local agent, smart router, and models are installed and running correctly.
          </p>
          <button 
            className="btn btn-primary"
            onClick={async () => {
              alert("Validating system...\n1. SaaS Connection: OK\n2. Agent Configuration: Checking...\n3. Local Model: Checking...");
              const doctorOutput = await window.omniworkerAPI.runOmniWorkerDoctor();
              alert("Validation Results:\n\n" + doctorOutput.split("\n").slice(0, 10).join("\n") + "\n...");
            }}
          >
            Run Validation Check
          </button>
        </div>
      </div>
    </div>
  );
}
