import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";

interface ToolsetInfo {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface ToolsProps {
  profile?: string;
  onToggleToolset?: (key: string, enabled: boolean) => void;
}

// SVG icons per toolset key
const TOOL_ICONS: Record<string, React.JSX.Element> = {
  web: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  browser: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 3v6" />
    </svg>
  ),
  terminal: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m7 10 3 3-3 3M13 16h4" />
    </svg>
  ),
  file: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  ),
  code_execution: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
      <line x1="14" y1="4" x2="10" y2="20" />
    </svg>
  ),
  vision: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  image_gen: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  tts: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  skills: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z" />
    </svg>
  ),
  memory: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    </svg>
  ),
  session_search: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
      <path d="M11 8v6M8 11h6" />
    </svg>
  ),
  clarify: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  delegation: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  cronjob: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  moa: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  todo: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  ecommerce: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  smtp_client: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7M19 19H5" />
    </svg>
  ),
};

function ToolIcon({ toolKey }: { toolKey: string }): React.JSX.Element {
  return (
    <div className="tools-card-icon">
      {TOOL_ICONS[toolKey] || (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      )}
    </div>
  );
}

interface McpServer {
  name: string;
  type: string;
  enabled: boolean;
  detail: string;
}

function Tools({ profile, onToggleToolset }: ToolsProps): React.JSX.Element {
  const { t } = useI18n();
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);

  // SMTP Config panel state
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpEncryption, setSmtpEncryption] = useState<"none" | "ssl" | "tls">("tls");

  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapUser, setImapUser] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapEncryption, setImapEncryption] = useState<"none" | "ssl" | "tls">("ssl");

  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingImap, setTestingImap] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [imapTestResult, setImapTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isSmtpPanelExpanded, setIsSmtpPanelExpanded] = useState(false);

  const loadToolsets = useCallback(async (): Promise<void> => {
    setLoading(true);
    const [list, mcp, settings] = await Promise.all([
      window.omniworkerAPI.getToolsets(profile),
      window.omniworkerAPI.listMcpServers(profile),
      window.omniworkerAPI.getSmtpSettings(profile),
    ]);
    setToolsets(list);
    setMcpServers(mcp);
    if (settings) {
      setSmtpHost(settings.smtp_host || "");
      setSmtpPort(settings.smtp_port || 587);
      setSmtpUser(settings.smtp_user || "");
      setSmtpPassword(settings.smtp_password || "");
      setSmtpEncryption(settings.smtp_encryption || "tls");

      setImapHost(settings.imap_host || "");
      setImapPort(settings.imap_port || 993);
      setImapUser(settings.imap_user || "");
      setImapPassword(settings.imap_password || "");
      setImapEncryption(settings.imap_encryption || "ssl");
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadToolsets();
  }, [loadToolsets]);

  const testSmtp = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const res = await window.omniworkerAPI.testSmtpConnection(
        smtpHost,
        smtpPort,
        smtpEncryption,
        "smtp"
      );
      setSmtpTestResult(res);
    } catch (err: any) {
      setSmtpTestResult({ success: false, message: err.message || "Error al conectar." });
    } finally {
      setTestingSmtp(false);
    }
  };

  const testImap = async () => {
    setTestingImap(true);
    setImapTestResult(null);
    try {
      const res = await window.omniworkerAPI.testSmtpConnection(
        imapHost,
        imapPort,
        imapEncryption,
        "imap"
      );
      setImapTestResult(res);
    } catch (err: any) {
      setImapTestResult({ success: false, message: err.message || "Error al conectar." });
    } finally {
      setTestingImap(false);
    }
  };

  const handleSaveSmtpSettings = async () => {
    setSaveStatus("saving");
    try {
      await window.omniworkerAPI.saveSmtpSettings({
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort),
        smtp_user: smtpUser,
        smtp_password: smtpPassword,
        smtp_encryption: smtpEncryption,
        imap_host: imapHost,
        imap_port: Number(imapPort),
        imap_user: imapUser,
        imap_password: imapPassword,
        imap_encryption: imapEncryption,
      }, profile);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
      
      const list = await window.omniworkerAPI.getToolsets(profile);
      setToolsets(list);

      if (onToggleToolset) {
        onToggleToolset("smtp_client", true);
      }
    } catch (err) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    }
  };

  async function handleToggle(
    key: string,
    currentEnabled: boolean,
  ): Promise<void> {
    setToolsets((prev) =>
      prev.map((t) => (t.key === key ? { ...t, enabled: !currentEnabled } : t)),
    );
    await window.omniworkerAPI.setToolsetEnabled(key, !currentEnabled, profile);
    if (onToggleToolset) {
      onToggleToolset(key, !currentEnabled);
    }
  }

  if (loading) {
    return (
      <div className="tools-container">
        <div className="tools-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="tools-container">
      <div className="tools-header">
        <h2 className="tools-title">{t("tools.title")}</h2>
        <p className="tools-subtitle">{t("tools.subtitle")}</p>
      </div>

      <div className="tools-grid">
        {toolsets.map((t) => (
          <div
            key={t.key}
            className={`tools-card ${t.enabled ? "tools-card-enabled" : "tools-card-disabled"}`}
            onClick={() => handleToggle(t.key, t.enabled)}
          >
            <div className="tools-card-top">
              <ToolIcon toolKey={t.key} />
              <label
                className="tools-toggle"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={t.enabled}
                  onChange={() => handleToggle(t.key, t.enabled)}
                />
                <span className="tools-toggle-track" />
              </label>
            </div>
            <div className="tools-card-label">{t.label}</div>
            <div className="tools-card-description">{t.description}</div>
          </div>
        ))}
      </div>

      {/* SMTP/IMAP Mail Client Credentials Panel */}
      <div style={{
        marginTop: "32px",
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
        overflow: "hidden",
        backdropFilter: "blur(12px)",
        transition: "all 0.3s ease"
      }}>
        {/* Panel Header */}
        <div 
          onClick={() => setIsSmtpPanelExpanded(!isSmtpPanelExpanded)}
          style={{
            padding: "20px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            background: "rgba(255, 255, 255, 0.01)",
            borderBottom: isSmtpPanelExpanded ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
            userSelect: "none",
            transition: "all 0.2s ease"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, rgba(79, 70, 229, 0.2), rgba(6, 182, 212, 0.2))",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#38bdf8"
            }}>
              {TOOL_ICONS.smtp_client}
            </div>
            <div style={{ textAlign: "left" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#f3f4f6" }}>
                Configuración de Servidor SMTP & IMAP
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                Conecta tus cuentas de correo electrónico para automatizar tareas, enviar alertas y responder emails con IA
              </p>
            </div>
          </div>
          <div style={{
            transform: isSmtpPanelExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease",
            color: "var(--text-muted)"
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>

        {/* Panel Content */}
        {isSmtpPanelExpanded && (
          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "24px", textAlign: "left" }}>
            {/* Split layout for SMTP (left) and IMAP (right) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              {/* SMTP CONFIG */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <h4 style={{ margin: "0 0 4px 0", color: "#38bdf8", fontWeight: "600", fontSize: "13px", letterSpacing: "0.5px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#38bdf8" }} /> Servidor de Salida (SMTP)
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>SMTP Host</label>
                  <input
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com o mail.tuempresa.com"
                    style={{
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#f3f4f6",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>Puerto SMTP</label>
                    <input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(Number(e.target.value))}
                      placeholder="587 o 465"
                      style={{
                        background: "rgba(0, 0, 0, 0.2)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        color: "#f3f4f6",
                        fontSize: "13px",
                        outline: "none"
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>Cifrado SMTP</label>
                    <select
                      value={smtpEncryption}
                      onChange={(e) => setSmtpEncryption(e.target.value as any)}
                      style={{
                        background: "#18181b",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        color: "#f3f4f6",
                        fontSize: "13px",
                        outline: "none",
                        cursor: "pointer"
                      }}
                    >
                      <option value="none">Ninguno (TCP plano)</option>
                      <option value="ssl">SSL / TLS Directo</option>
                      <option value="tls">STARTTLS / TLS</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>Usuario SMTP (Email)</label>
                  <input
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="usuario@dominio.com"
                    style={{
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#f3f4f6",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>Contraseña SMTP</label>
                  <input
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder="Contraseña del correo o app password"
                    style={{
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#f3f4f6",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                  <button
                    onClick={testSmtp}
                    disabled={testingSmtp}
                    style={{
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      padding: "10px 16px",
                      color: "#f3f4f6",
                      fontSize: "12px",
                      fontWeight: "500",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      transition: "all 0.2s"
                    }}
                  >
                    {testingSmtp ? "Probando..." : "Probar Conexión SMTP"}
                  </button>

                  {smtpTestResult && (
                    <div style={{
                      background: smtpTestResult.success ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                      border: smtpTestResult.success ? "1px solid rgba(34, 197, 94, 0.2)" : "1px solid rgba(239, 68, 68, 0.2)",
                      color: smtpTestResult.success ? "#4ade80" : "#f87171",
                      borderRadius: "8px",
                      padding: "10px",
                      fontSize: "11px",
                      lineHeight: "1.4"
                    }}>
                      <strong>{smtpTestResult.success ? "Éxito" : "Fallo"}:</strong> {smtpTestResult.message}
                    </div>
                  )}
                </div>
              </div>

              {/* IMAP CONFIG */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", borderLeft: "1px solid rgba(255, 255, 255, 0.06)", paddingLeft: "24px" }}>
                <h4 style={{ margin: "0 0 4px 0", color: "#818cf8", fontWeight: "600", fontSize: "13px", letterSpacing: "0.5px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#818cf8" }} /> Servidor de Entrada (IMAP)
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>IMAP Host</label>
                  <input
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    placeholder="imap.gmail.com o mail.tuempresa.com"
                    style={{
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#f3f4f6",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>Puerto IMAP</label>
                    <input
                      type="number"
                      value={imapPort}
                      onChange={(e) => setImapPort(Number(e.target.value))}
                      placeholder="993 o 143"
                      style={{
                        background: "rgba(0, 0, 0, 0.2)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        color: "#f3f4f6",
                        fontSize: "13px",
                        outline: "none"
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>Cifrado IMAP</label>
                    <select
                      value={imapEncryption}
                      onChange={(e) => setImapEncryption(e.target.value as any)}
                      style={{
                        background: "#18181b",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        color: "#f3f4f6",
                        fontSize: "13px",
                        outline: "none",
                        cursor: "pointer"
                      }}
                    >
                      <option value="none">Ninguno (TCP plano)</option>
                      <option value="ssl">SSL / TLS Directo</option>
                      <option value="tls">STARTTLS / TLS</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>Usuario IMAP (Email)</label>
                  <input
                    value={imapUser}
                    onChange={(e) => setImapUser(e.target.value)}
                    placeholder="usuario@dominio.com"
                    style={{
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#f3f4f6",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>Contraseña IMAP</label>
                  <input
                    type="password"
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    placeholder="Contraseña del correo o app password"
                    style={{
                      background: "rgba(0, 0, 0, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#f3f4f6",
                      fontSize: "13px",
                      outline: "none"
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                  <button
                    onClick={testImap}
                    disabled={testingImap}
                    style={{
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      padding: "10px 16px",
                      color: "#f3f4f6",
                      fontSize: "12px",
                      fontWeight: "500",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      transition: "all 0.2s"
                    }}
                  >
                    {testingImap ? "Probando..." : "Probar Conexión IMAP"}
                  </button>

                  {imapTestResult && (
                    <div style={{
                      background: imapTestResult.success ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                      border: imapTestResult.success ? "1px solid rgba(34, 197, 94, 0.2)" : "1px solid rgba(239, 68, 68, 0.2)",
                      color: imapTestResult.success ? "#4ade80" : "#f87171",
                      borderRadius: "8px",
                      padding: "10px",
                      fontSize: "11px",
                      lineHeight: "1.4"
                    }}>
                      <strong>{imapTestResult.success ? "Éxito" : "Fallo"}:</strong> {imapTestResult.message}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "12px",
              borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              paddingTop: "20px"
            }}>
              {saveStatus === "saved" && (
                <span style={{ color: "#4ade80", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  ¡Configuración guardada y activada!
                </span>
              )}
              {saveStatus === "error" && (
                <span style={{ color: "#f87171", fontSize: "13px" }}>
                  Error al guardar los ajustes.
                </span>
              )}

              <button
                onClick={handleSaveSmtpSettings}
                disabled={saveStatus === "saving"}
                style={{
                  background: "linear-gradient(135deg, #4f46e5, #818cf8)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 24px",
                  color: "white",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "all 0.2s"
                }}
              >
                {saveStatus === "saving" ? "Guardando..." : "Guardar y Habilitar Cliente"}
              </button>
            </div>
          </div>
        )}
      </div>

      {mcpServers.length > 0 && (
        <>
          <div className="tools-header" style={{ marginTop: 32 }}>
            <h2 className="tools-title">{t("tools.mcpServers")}</h2>
            <p
              className="tools-subtitle"
              dangerouslySetInnerHTML={{ __html: t("tools.mcpDescription") }}
            />
          </div>
          <div className="tools-grid">
            {mcpServers.map((s) => (
              <div
                key={s.name}
                className={`tools-card ${s.enabled ? "tools-card-enabled" : "tools-card-disabled"}`}
              >
                <div className="tools-card-top">
                  <div className="tools-card-icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="2" width="20" height="8" rx="2" />
                      <rect x="2" y="14" width="20" height="8" rx="2" />
                      <circle cx="6" cy="6" r="1" />
                      <circle cx="6" cy="18" r="1" />
                    </svg>
                  </div>
                  <span
                    className="tools-card-description"
                    style={{ fontSize: 10 }}
                  >
                    {s.type === "http" ? t("tools.http") : t("tools.stdio")}
                  </span>
                </div>
                <div className="tools-card-label">{s.name}</div>
                <div className="tools-card-description">
                  {s.detail}
                  {!s.enabled && (
                    <span style={{ color: "var(--error)", marginLeft: 6 }}>
                      ({t("tools.disabled")})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default Tools;
