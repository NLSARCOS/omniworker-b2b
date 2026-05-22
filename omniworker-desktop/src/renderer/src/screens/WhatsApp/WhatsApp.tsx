import { useState, useCallback, useEffect, useRef } from "react";
import { useI18n } from "../../components/useI18n";
import { Spinner } from "../../assets/icons";

type WhatsAppState =
  | "checking"
  | "not-configured"
  | "setup"
  | "installing"
  | "ready"
  | "running"
  | "error";

interface WhatsAppProps {
  visible: boolean;
}

interface BotStatus {
  configured: boolean;
  running: boolean;
  port: number;
  portInUse: boolean;
  provider: string;
  businessName: string;
  agentName: string;
  error: string;
}

interface TestMessage {
  role: "user" | "bot";
  text: string;
}

export default function WhatsApp({ visible }: WhatsAppProps): React.JSX.Element {
  const { t } = useI18n();
  const [state, setState] = useState<WhatsAppState>("checking");
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [error, setError] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState("");

  // Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [agentPurpose, setAgentPurpose] = useState("");
  const [agentName, setAgentName] = useState("");
  const [tone, setTone] = useState("professional");
  const [hours, setHours] = useState("");
  const [provider, setProvider] = useState("whapi");
  const [port] = useState(8000);
  const [whapiToken, setWhapiToken] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaVerifyToken, setMetaVerifyToken] = useState("agentkit-verify");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState("");
  const [openwaServerUrl, setOpenwaServerUrl] = useState("http://localhost:2785");
  const [openwaApiKey, setOpenwaApiKey] = useState("");
  const [installProgress, setInstallProgress] = useState(0);

  // Test chat state
  const [testMessages, setTestMessages] = useState<TestMessage[]>([]);
  const [testInput, setTestInput] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const testMessagesEnd = useRef<HTMLDivElement>(null);

  // Local OpenWA Installer states
  const [openwaInstalling, setOpenwaInstalling] = useState(false);
  const [openwaInstallProgress, setOpenwaInstallProgress] = useState(0);
  const [openwaInstallStepMessage, setOpenwaInstallStepMessage] = useState("");
  const [openwaInstallError, setOpenwaInstallError] = useState("");

  const api = window.omniworkerAPI;

  const handleInstallOpenwa = async (): Promise<void> => {
    if (openwaInstalling) return;
    setOpenwaInstalling(true);
    setOpenwaInstallProgress(0);
    setOpenwaInstallStepMessage("Iniciando descarga de OpenWA Server...");
    setOpenwaInstallError("");

    const cleanup = api.onOpenwaInstallProgress((progress) => {
      setOpenwaInstallProgress(Math.floor((progress.step / progress.total) * 100));
      setOpenwaInstallStepMessage(progress.message);
    });

    try {
      const res = await api.startOpenwaInstall();
      if (res.success) {
        setOpenwaInstallProgress(100);
        setOpenwaInstallStepMessage("¡Instalación local completada con éxito!");
        setOpenwaServerUrl("http://localhost:2785");
      } else {
        setOpenwaInstallError(res.error || "Ocurrió un error inesperado al descargar o extraer.");
      }
    } catch (err: any) {
      setOpenwaInstallError(err.message || "Error de conexión con el instalador.");
    } finally {
      setOpenwaInstalling(false);
      cleanup();
    }
  };

  // Status polling
  const checkStatus = useCallback(async () => {
    try {
      const s = await api.whatsappBotStatus();
      setStatus(s);
      if (s.running) {
        setState("running");
      } else if (s.configured) {
        setState("ready");
      } else {
        setState("not-configured");
      }
      if (s.error) setError(s.error);
    } catch {
      setState("not-configured");
    }
  }, [api]);

  useEffect(() => {
    if (visible) checkStatus();
  }, [visible, checkStatus]);

  // Refresh logs periodically when running
  useEffect(() => {
    if (!visible || state !== "running") return;
    const interval = setInterval(async () => {
      try {
        const l = await api.whatsappBotGetLogs();
        setLogs(l);
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [visible, state, api]);

  // Scroll test chat
  useEffect(() => {
    testMessagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [testMessages]);

  // Setup handler
  const handleSetup = async (): Promise<void> => {
    setState("installing");
    setInstallProgress(0);
    setError("");

    const unsub = api.onWhatsappBotSetupProgress((progress) => {
      setInstallProgress(
        Math.round((progress.step / progress.totalSteps) * 100),
      );
      if (progress.log) setLogs((prev) => prev + progress.log + "\n");
    });

    try {
      const credentials: Record<string, string> = {};
      if (provider === "whapi") {
        credentials.whapi_token = whapiToken;
      } else if (provider === "meta") {
        credentials.meta_access_token = metaAccessToken;
        credentials.meta_phone_number_id = metaPhoneNumberId;
        credentials.meta_verify_token = metaVerifyToken;
      } else if (provider === "twilio") {
        credentials.twilio_account_sid = twilioAccountSid;
        credentials.twilio_auth_token = twilioAuthToken;
        credentials.twilio_phone_number = twilioPhoneNumber;
      } else if (provider === "openwa") {
        credentials.openwa_server_url = openwaServerUrl;
        credentials.openwa_api_key = openwaApiKey;
      }

      const result = await api.whatsappBotSetup({
        businessName,
        businessDescription,
        agentPurpose,
        agentName,
        tone,
        hours,
        provider,
        port,
        credentials,
      });

      if (!result.success) {
        setError(result.error || t("whatsapp.errorSetup"));
        setState("error");
        return;
      }

      await checkStatus();
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    } finally {
      unsub();
    }
  };

  const handleStart = async (): Promise<void> => {
    const result = await api.whatsappBotStart();
    if (result.success) {
      setState("running");
      setError("");
    } else {
      setError(result.error || t("whatsapp.errorStart"));
    }
  };

  const handleStop = async (): Promise<void> => {
    await api.whatsappBotStop();
    setState("ready");
    setError("");
  };

  const handleTestMessage = async (): Promise<void> => {
    if (!testInput.trim() || testLoading) return;
    const msg = testInput.trim();
    setTestInput("");
    setTestMessages((prev) => [...prev, { role: "user", text: msg }]);
    setTestLoading(true);
    try {
      const result = await api.whatsappBotTest(msg);
      setTestMessages((prev) => [
        ...prev,
        { role: "bot", text: result.response || "No response" },
      ]);
    } catch (err) {
      setTestMessages((prev) => [
        ...prev,
        { role: "bot", text: `Error: ${(err as Error).message}` },
      ]);
    }
    setTestLoading(false);
  };

  const WIZARD_STEPS = [
    t("whatsapp.stepBusinessInfo"),
    t("whatsapp.stepAgentPersonality"),
    t("whatsapp.stepProvider"),
  ];

  // ── Render states ────────────────────────────────────────────

  // Checking
  if (state === "checking") {
    return (
      <div className="whatsapp-center">
        <div className="whatsapp-setup-card">
          <div className="whatsapp-spinner" />
          <p className="whatsapp-setup-desc">{t("whatsapp.checkingStatus")}</p>
        </div>
      </div>
    );
  }

  // Not configured
  if (state === "not-configured") {
    return (
      <div className="whatsapp-center">
        <div className="whatsapp-setup-card">
          <h2 className="whatsapp-setup-title">{t("whatsapp.setupTitle")}</h2>
          <p className="whatsapp-setup-desc">{t("whatsapp.setupDesc")}</p>
          <div className="whatsapp-setup-actions">
            <button
              className="whatsapp-toolbar-btn primary"
              onClick={() => {
                setWizardStep(0);
                setState("setup");
              }}
            >
              {t("whatsapp.create")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Setup wizard
  if (state === "setup") {
    return (
      <div className="whatsapp-wizard">
        <h2 className="whatsapp-setup-title" style={{ marginBottom: 8 }}>
          {t("whatsapp.setupTitle")}
        </h2>
        {/* Step indicators */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 24,
          }}
        >
          {WIZARD_STEPS.map((label, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                padding: "4px 0",
                textAlign: "center",
                fontSize: 11,
                borderBottom: `2px solid ${
                  i === wizardStep
                    ? "var(--accent)"
                    : i < wizardStep
                      ? "var(--success)"
                      : "var(--border)"
                }`,
                color:
                  i === wizardStep
                    ? "var(--accent-text)"
                    : "var(--text-muted)",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Step 0: Business Info */}
        {wizardStep === 0 && (
          <div className="whatsapp-wizard-step">
            <div className="whatsapp-field">
              <label>{t("whatsapp.businessName")}</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={t("whatsapp.businessNamePlaceholder")}
              />
            </div>
            <div className="whatsapp-field">
              <label>{t("whatsapp.businessDescription")}</label>
              <textarea
                value={businessDescription}
                onChange={(e) => setBusinessDescription(e.target.value)}
                placeholder={t("whatsapp.businessDescriptionPlaceholder")}
              />
            </div>
            <div className="whatsapp-field">
              <label>{t("whatsapp.agentPurpose")}</label>
              <textarea
                value={agentPurpose}
                onChange={(e) => setAgentPurpose(e.target.value)}
                placeholder={t("whatsapp.agentPurposePlaceholder")}
              />
            </div>
          </div>
        )}

        {/* Step 1: Agent Personality */}
        {wizardStep === 1 && (
          <div className="whatsapp-wizard-step">
            <div className="whatsapp-field">
              <label>{t("whatsapp.agentName")}</label>
              <input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={t("whatsapp.agentNamePlaceholder")}
              />
            </div>
            <div className="whatsapp-field">
              <label>{t("whatsapp.tone")}</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="professional">
                  {t("whatsapp.toneProfessional")}
                </option>
                <option value="friendly">
                  {t("whatsapp.toneFriendly")}
                </option>
                <option value="sales">{t("whatsapp.toneSales")}</option>
                <option value="empathetic">
                  {t("whatsapp.toneEmpathetic")}
                </option>
              </select>
            </div>
            <div className="whatsapp-field">
              <label>{t("whatsapp.hours")}</label>
              <input
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder={t("whatsapp.hoursPlaceholder")}
              />
            </div>
          </div>
        )}

        {/* Step 2: Provider */}
        {wizardStep === 2 && (
          <div className="whatsapp-wizard-step">
            <h3>{t("whatsapp.selectProvider")}</h3>
            <div className="whatsapp-provider-cards">
              <div
                className={`whatsapp-provider-card ${provider === "whapi" ? "selected" : ""}`}
                onClick={() => setProvider("whapi")}
              >
                <h4>{t("whatsapp.providerWhapi")}</h4>
              </div>
              <div
                className={`whatsapp-provider-card ${provider === "meta" ? "selected" : ""}`}
                onClick={() => setProvider("meta")}
              >
                <h4>{t("whatsapp.providerMeta")}</h4>
              </div>
              <div
                className={`whatsapp-provider-card ${provider === "twilio" ? "selected" : ""}`}
                onClick={() => setProvider("twilio")}
              >
                <h4>{t("whatsapp.providerTwilio")}</h4>
              </div>
              <div
                className={`whatsapp-provider-card ${provider === "openwa" ? "selected" : ""}`}
                onClick={() => setProvider("openwa")}
              >
                <h4>OpenWA</h4>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>Self-hosted · Open Source</p>
              </div>
            </div>

            {provider === "whapi" && (
              <div className="whatsapp-field">
                <label>{t("whatsapp.whapiToken")}</label>
                <input
                  type="password"
                  value={whapiToken}
                  onChange={(e) => setWhapiToken(e.target.value)}
                />
              </div>
            )}
            {provider === "meta" && (
              <>
                <div className="whatsapp-field">
                  <label>{t("whatsapp.metaAccessToken")}</label>
                  <input
                    type="password"
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                  />
                </div>
                <div className="whatsapp-field">
                  <label>{t("whatsapp.metaPhoneNumberId")}</label>
                  <input
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                  />
                </div>
                <div className="whatsapp-field">
                  <label>{t("whatsapp.metaVerifyToken")}</label>
                  <input
                    value={metaVerifyToken}
                    onChange={(e) => setMetaVerifyToken(e.target.value)}
                  />
                </div>
              </>
            )}
            {provider === "twilio" && (
              <>
                <div className="whatsapp-field">
                  <label>{t("whatsapp.twilioAccountSid")}</label>
                  <input
                    value={twilioAccountSid}
                    onChange={(e) => setTwilioAccountSid(e.target.value)}
                  />
                </div>
                <div className="whatsapp-field">
                  <label>{t("whatsapp.twilioAuthToken")}</label>
                  <input
                    type="password"
                    value={twilioAuthToken}
                    onChange={(e) => setTwilioAuthToken(e.target.value)}
                  />
                </div>
                <div className="whatsapp-field">
                  <label>{t("whatsapp.twilioPhoneNumber")}</label>
                  <input
                    value={twilioPhoneNumber}
                    onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                  />
                </div>
              </>
            )}
            {provider === "openwa" && (
              <>
                <div style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                  backdropFilter: "blur(10px)"
                }}>
                  <h4 style={{ margin: "0 0 6px 0", color: "#f3f4f6", fontSize: "14px", fontWeight: "600" }}>
                    Instalador de Servidor OpenWA Local
                  </h4>
                  <p style={{ margin: "0 0 14px 0", color: "var(--text-muted)", fontSize: "12px", lineHeight: "1.4" }}>
                    Descarga e instala de forma automática el servidor local de OpenWA para ejecutar el bot de forma nativa en tu computadora.
                  </p>

                  {openwaInstalling ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", fontSize: "12px" }}>
                        <span style={{ color: "#38bdf8", fontWeight: "500", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Spinner size={14} /> {openwaInstallStepMessage}
                        </span>
                        <span style={{ color: "#f3f4f6", fontWeight: "600" }}>{openwaInstallProgress}%</span>
                      </div>
                      <div className="whatsapp-progress-bar" style={{ height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "4px", overflow: "hidden" }}>
                        <div className="whatsapp-progress-fill" style={{ width: `${openwaInstallProgress}%`, height: "100%", background: "linear-gradient(90deg, #38bdf8, #818cf8)", transition: "width 0.3s ease" }} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      {openwaInstallError && (
                        <div style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          color: "#f87171",
                          borderRadius: "8px",
                          padding: "10px",
                          marginBottom: "12px",
                          fontSize: "12px"
                        }}>
                          <strong>Error de instalación:</strong> {openwaInstallError}
                        </div>
                      )}

                      {openwaInstallProgress === 100 && !openwaInstallError && (
                        <div style={{
                          background: "rgba(34, 197, 94, 0.1)",
                          border: "1px solid rgba(34, 197, 94, 0.2)",
                          color: "#4ade80",
                          borderRadius: "8px",
                          padding: "10px",
                          marginBottom: "12px",
                          fontSize: "12px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px"
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          <span>Instalado localmente con éxito en <code>~/.omniworker/openwa</code>.</span>
                        </div>
                      )}

                      <button
                        onClick={handleInstallOpenwa}
                        className="whatsapp-toolbar-btn primary"
                        style={{
                          width: "100%",
                          justifyContent: "center",
                          padding: "10px 16px",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontWeight: "500",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background: "linear-gradient(135deg, #4f46e5, #06b6d4)",
                          border: "none",
                          cursor: "pointer",
                          color: "white",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Descargar e Instalar Localmente
                      </button>
                    </div>
                  )}
                </div>

                <div className="whatsapp-field">
                  <label>OpenWA Server URL</label>
                  <input
                    value={openwaServerUrl}
                    onChange={(e) => setOpenwaServerUrl(e.target.value)}
                    placeholder="http://localhost:2785"
                  />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Puerto por defecto: 2785. El bot recibirá webhooks automáticamente.
                  </span>
                </div>
                <div className="whatsapp-field">
                  <label>OpenWA API Key</label>
                  <input
                    type="password"
                    value={openwaApiKey}
                    onChange={(e) => setOpenwaApiKey(e.target.value)}
                    placeholder="Tu X-API-Key de OpenWA (dejar en blanco si se instaló localmente)"
                  />
                </div>
              </>
            )}
          </div>
        )}


        {/* Wizard actions */}
        <div className="whatsapp-wizard-actions">
          <button
            className="whatsapp-toolbar-btn"
            onClick={() => {
              if (wizardStep === 0) setState("not-configured");
              else setWizardStep(wizardStep - 1);
            }}
          >
            {t("whatsapp.back")}
          </button>
          {wizardStep < 2 ? (
            <button
              className="whatsapp-toolbar-btn primary"
              onClick={() => setWizardStep(wizardStep + 1)}
            >
              {t("whatsapp.next")}
            </button>
          ) : (
            <button
              className="whatsapp-toolbar-btn primary"
              onClick={handleSetup}
              disabled={!businessName}
            >
              {t("whatsapp.create")}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Installing
  if (state === "installing") {
    return (
      <div className="whatsapp-center">
        <div className="whatsapp-setup-card">
          <div className="whatsapp-spinner" />
          <h2 className="whatsapp-setup-title">{t("whatsapp.generating")}</h2>
          <div className="whatsapp-progress-bar">
            <div
              className="whatsapp-progress-fill"
              style={{ width: `${installProgress}%` }}
            />
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 16 }}>
            {installProgress}%
          </p>
        </div>
      </div>
    );
  }

  // Error
  if (state === "error") {
    return (
      <div className="whatsapp-center">
        <div className="whatsapp-setup-card">
          <h2 className="whatsapp-setup-title" style={{ color: "var(--error)" }}>
            {t("whatsapp.errorTitle")}
          </h2>
          <p className="whatsapp-setup-desc">{error}</p>
          <div className="whatsapp-setup-actions">
            <button
              className="whatsapp-toolbar-btn"
              onClick={() => checkStatus()}
            >
              {t("whatsapp.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ready (configured but not running)
  if (state === "ready") {
    return (
      <div className="whatsapp-ready">
        <div className="whatsapp-toolbar">
          <div className="whatsapp-toolbar-left">
            <div className="whatsapp-status-dot stopped" />
            <span className="whatsapp-status-label">
              {t("whatsapp.botStopped")}
            </span>
            <span className="whatsapp-toolbar-title">
              {status?.businessName || ""}
            </span>
          </div>
          <div className="whatsapp-toolbar-right">
            <button className="whatsapp-toolbar-btn primary" onClick={handleStart}>
              {t("whatsapp.startBot")}
            </button>
            <button
              className="whatsapp-toolbar-btn"
              onClick={() => setState("setup")}
            >
              {t("whatsapp.configure")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Running
  return (
    <div className="whatsapp-ready" style={{ position: "relative" }}>
      <div className="whatsapp-toolbar">
        <div className="whatsapp-toolbar-left">
          <div className="whatsapp-status-dot running" />
          <span className="whatsapp-status-label">
            {t("whatsapp.botRunning")}
          </span>
          <span className="whatsapp-toolbar-title">
            {status?.agentName || ""} — {status?.businessName || ""}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            :{status?.port}
          </span>
        </div>
        <div className="whatsapp-toolbar-right">
          <button
            className="whatsapp-toolbar-btn"
            onClick={() => setShowLogs(!showLogs)}
          >
            {t("whatsapp.viewLogs")}
          </button>
          <button
            className="whatsapp-toolbar-btn danger"
            onClick={handleStop}
          >
            {t("whatsapp.stopBot")}
          </button>
        </div>
      </div>

      {/* Dashboard */}
      <div className="whatsapp-dashboard">
        {/* Test Chat */}
        <div className="whatsapp-dashboard-card">
          <h4>{t("whatsapp.testChat")}</h4>
          <div className="whatsapp-test-chat">
            <div className="whatsapp-test-messages">
              {testMessages.length === 0 && (
                <p style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", padding: 20 }}>
                  {t("whatsapp.testChatPlaceholder")}
                </p>
              )}
              {testMessages.map((msg, i) => (
                <div key={i} className={`whatsapp-test-msg ${msg.role}`}>
                  {msg.text}
                </div>
              ))}
              {testLoading && (
                <div className="whatsapp-test-msg bot">
                  <Spinner
                    style={{
                      width: 14,
                      height: 14,
                      animation: "whatsapp-spin 0.6s linear infinite",
                    }}
                  />
                </div>
              )}
              <div ref={testMessagesEnd} />
            </div>
            <div className="whatsapp-test-input">
              <input
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder={t("whatsapp.testChatPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTestMessage();
                }}
                disabled={testLoading}
              />
              <button
                className="whatsapp-toolbar-btn primary"
                onClick={handleTestMessage}
                disabled={testLoading || !testInput.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Conversations */}
        <div className="whatsapp-dashboard-card">
          <h4>{t("whatsapp.conversations")}</h4>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("whatsapp.noConversations")}
          </p>
        </div>
      </div>

      {/* Logs overlay */}
      {showLogs && (
        <div className="whatsapp-logs-panel">
          <div className="whatsapp-logs-header">
            <h4>{t("whatsapp.processLogs")}</h4>
            <button
              className="whatsapp-toolbar-btn"
              onClick={() => setShowLogs(false)}
            >
              {t("whatsapp.close")}
            </button>
          </div>
          <div className="whatsapp-logs-content">
            {logs || t("whatsapp.noLogs")}
          </div>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="whatsapp-error-bar">
          <span className="whatsapp-error-text">{error}</span>
          <div className="whatsapp-error-actions">
            <button
              className="whatsapp-toolbar-btn"
              onClick={() => setError("")}
            >
              {t("whatsapp.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
