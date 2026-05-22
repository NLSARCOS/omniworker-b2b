import { useState, useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import Chat, { ChatMessage } from "../Chat/Chat";
import Sessions from "../Sessions/Sessions";
import Agents from "../Agents/Agents";
import Settings from "../Settings/Settings";
import Skills from "../Skills/Skills";
import Soul from "../Soul/Soul";
import Memory from "../Memory/Memory";
import Tools from "../Tools/Tools";
import Gateway from "../Gateway/Gateway";
import WhatsApp from "../WhatsApp/WhatsApp";
import Models from "../Models/Models";
import Providers from "../Providers/Providers";
import Schedules from "../Schedules/Schedules";
import SmartPatterns from "../SmartPatterns/SmartPatterns";
import Kanban from "../Kanban/Kanban";
import Account from "../Account/Account";
import RemoteNotice from "../../components/RemoteNotice";
import VerifyWarningBanner from "../../components/VerifyWarningBanner";

import {
  ChatBubble,
  Clock,
  Users,
  User,
  Settings as SettingsIcon,
  Puzzle,
  Sparkles,
  Brain,
  Wrench,
  Signal,
  Timer,
  Kanban as KanbanIcon,
  Download,
  Bot,
} from "../../assets/icons";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "../../components/useI18n";

type View =
  | "chat"
  | "sessions"
  | "agents"
  | "whatsapp"
  | "models"
  | "providers"
  | "skills"
  | "soul"
  | "memory"
  | "tools"
  | "schedules"
  | "smartpatterns"
  | "kanban"
  | "gateway"
  | "settings"
  | "account";

const NAV_ITEMS: { view: View; icon: LucideIcon; labelKey: string }[] = [
  { view: "chat", icon: ChatBubble, labelKey: "navigation.chat" },
  { view: "sessions", icon: Clock, labelKey: "navigation.sessions" },
  { view: "agents", icon: Users, labelKey: "navigation.agents" },
  { view: "whatsapp", icon: Bot, labelKey: "navigation.whatsapp" },
  { view: "kanban", icon: KanbanIcon, labelKey: "navigation.kanban" },
  //  { view: "models", icon: Layers, labelKey: "navigation.models" },
  //  { view: "providers", icon: KeyRound, labelKey: "navigation.providers" },
  { view: "skills", icon: Puzzle, labelKey: "navigation.skills" },
  { view: "soul", icon: Sparkles, labelKey: "navigation.soul" },
  { view: "memory", icon: Brain, labelKey: "navigation.memory" },
  { view: "tools", icon: Wrench, labelKey: "navigation.tools" },
  { view: "schedules", icon: Timer, labelKey: "navigation.schedules" },
  { view: "smartpatterns", icon: Brain, labelKey: "navigation.smartpatterns" },
  { view: "gateway", icon: Signal, labelKey: "navigation.gateway" },
  { view: "settings", icon: SettingsIcon, labelKey: "navigation.settings" },
  { view: "account", icon: User, labelKey: "navigation.account" },
];

interface LayoutProps {
  verifyWarning?: boolean;
  onReinstall?: () => void;
  onDismissVerifyWarning?: () => void;
  userData?: any;
  authToken?: string | null;
  onLogout?: () => void;
}

function Layout({
  verifyWarning,
  onReinstall,
  onDismissVerifyWarning,
  userData,
  authToken,
  onLogout,
}: LayoutProps = {}): React.JSX.Element {
  const { t } = useI18n();
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Premium floating cards layout reveal transition
  useEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(
      sidebarRef.current,
      { opacity: 0, x: -30, scale: 0.98 },
      { opacity: 1, x: 0, scale: 1, duration: 1.0, ease: "power4.out", delay: 0.05 }
    );
    tl.fromTo(
      contentRef.current,
      { opacity: 0, x: 30, scale: 0.98 },
      { opacity: 1, x: 0, scale: 1, duration: 1.0, ease: "power4.out" },
      "-=0.75"
    );
  }, []);
  const [activeProfile, setActiveProfile] = useState("default");
  // Tabs lazy-mount on first visit, then stay mounted (display:none toggle).
  // Keeps IPC refetch / DOM rebuild off the tab-switch hot path.
  const [visitedViews, setVisitedViews] = useState<Set<View>>(
    () => new Set<View>(["chat"]),
  );
  // Remote-only mode — SSH tunnel has full access; only pure HTTP remote mode restricts screens
  const [remoteMode, setRemoteMode] = useState(false);
  const [whatsappBotEnabled, setWhatsappBotEnabled] = useState(false);

  const checkWhatsappBotEnabled = useCallback(async (profileName: string) => {
    try {
      const toolsets = await window.omniworkerAPI.getToolsets(profileName);
      const isEnabled = toolsets.some((t) => t.key === "whatsapp_bot" && t.enabled);
      setWhatsappBotEnabled(isEnabled);
    } catch (e) {
      console.error("Failed to check whatsapp bot status:", e);
      setWhatsappBotEnabled(false);
    }
  }, []);

  useEffect(() => {
    checkWhatsappBotEnabled(activeProfile);
  }, [activeProfile, checkWhatsappBotEnabled, view]);

  const paneStyle = (target: View): React.CSSProperties => ({
    display: view === target ? "flex" : "none",
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
  });

  const goTo = useCallback((v: View) => {
    setVisitedViews((prev) => (prev.has(v) ? prev : new Set(prev).add(v)));
    setView(v);
  }, []);

  // Re-check remote mode on tab switch (picks up Settings changes)
  useEffect(() => {
    window.omniworkerAPI.isRemoteOnlyMode().then(setRemoteMode);
  }, [view]);

  // Auto-update state
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<
    "available" | "downloading" | "ready" | "error" | null
  >(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [saasDownloadUrl, setSaasDownloadUrl] = useState<string | null>(null);
  const [saasReleaseNotes, setSaasReleaseNotes] = useState<string | null>(null);

  useEffect(() => {
    const cleanupAvailable = window.omniworkerAPI.onUpdateAvailable((info) => {
      setUpdateVersion(info.version);
      setUpdateState("available");
      setUpdateError(null);
      setDownloadPercent(0);
      setSaasDownloadUrl(null);
      setSaasReleaseNotes(null);
      setShowUpdateModal(true);
    });
    const cleanupProgress = window.omniworkerAPI.onUpdateDownloadProgress(
      (info) => {
        setDownloadPercent(info.percent);
      },
    );
    const cleanupDownloaded = window.omniworkerAPI.onUpdateDownloaded(() => {
      setUpdateState("ready");
      setUpdateError(null);
      setShowUpdateModal(true);
    });
    const cleanupError = window.omniworkerAPI.onUpdateError((message) => {
      setUpdateState("error");
      setUpdateError(message);
      setDownloadPercent(0);
    });

    return () => {
      cleanupAvailable();
      cleanupProgress();
      cleanupDownloaded();
      cleanupError();
    };
  }, []);

  const [saasInfo, setSaasInfo] = useState<{
    plan: string | null;
    tokenBalance: number | null;
    tenantName: string | null;
    licenseUsage?: { active: number; max: number };
  } | null>(null);

  // OmniWorker B2B: Edge Agent Heartbeat
  useEffect(() => {
    let heartbeatTimer: any;
    let registeredAgentId: string | null = null;
    let isRegistering = false;

    async function ensureHeartbeat() {
      try {
        const envs = await window.omniworkerAPI.getEnv();
        const apiKey = envs?.CUSTOM_API_KEY;
        if (!apiKey || !apiKey.startsWith("tsto_")) return;

        const saasUrl =
          import.meta.env.VITE_SAAS_URL || "https://worker.thelab.lat";

        // Obtener la versión de la aplicación de escritorio
        let appVersion = "1.0.0";
        try {
          appVersion = await window.omniworkerAPI.getAppVersion();
        } catch (e) {
          console.error("Failed to get app version", e);
        }

        if (!registeredAgentId && !isRegistering) {
          isRegistering = true;
          const res = await fetch(`${saasUrl}/api/v1/edge/register`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              agentName: "OmniWorker Desktop",
              hostname: "Local Desktop",
              platform: window.electron?.process?.platform || "unknown",
              capabilities: ["chat", "files"],
            }),
          });
          const data = await res.json();
          if (data.success && data.agent?.id) {
            registeredAgentId = data.agent.id;
          }
          isRegistering = false;
        }

        if (registeredAgentId) {
          const res = await fetch(`${saasUrl}/api/v1/edge/heartbeat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              agentId: registeredAgentId,
              status: "online",
              version: appVersion,
            }),
          });
          const data = await res.json();
          if (data.success) {
            setSaasInfo({
              plan: data.plan || null,
              tokenBalance:
                typeof data.tokenBalance === "number"
                  ? data.tokenBalance
                  : null,
              tenantName: data.tenantName || null,
              licenseUsage: data.licenseUsage || undefined,
            });

            // Si hay una actualización disponible controlada por SaaS
            if (data.updateAvailable && data.updatePayload) {
              setUpdateVersion(data.updatePayload.version);
              setSaasDownloadUrl(data.updatePayload.downloadUrl);
              setSaasReleaseNotes(data.updatePayload.releaseNotes || null);
              setUpdateState("available");
              setUpdateError(null);
              setShowUpdateModal(true);
            }
          }
        }
      } catch (err) {
        console.error("Agent heartbeat error:", err);
        isRegistering = false;
      }
    }

    ensureHeartbeat();
    heartbeatTimer = setInterval(ensureHeartbeat, 30000);

    return () => clearInterval(heartbeatTimer);
  }, []);

  async function handleUpdate(): Promise<void> {
    if (saasDownloadUrl) {
      try {
        await window.omniworkerAPI.openExternal(saasDownloadUrl);
        setShowUpdateModal(false);
      } catch (err) {
        setUpdateError("No se pudo abrir el enlace de descarga.");
        setUpdateState("error");
      }
      return;
    }

    if (updateState === "available" || updateState === "error") {
      setUpdateError(null);
      setDownloadPercent(0);
      setUpdateState("downloading");
      try {
        const ok = await window.omniworkerAPI.downloadUpdate();
        if (!ok) setUpdateState("error");
      } catch (err) {
        setUpdateError(err instanceof Error ? err.message : String(err));
        setUpdateState("error");
      }
    } else if (updateState === "ready") {
      await window.omniworkerAPI.installUpdate();
    }
  }

  const handleNewChat = useCallback(() => {
    // Abort any in-flight chat before clearing
    window.omniworkerAPI.abortChat();
    setMessages([]);
    setCurrentSessionId(null);
    goTo("chat");
  }, [goTo]);

  // Listen for app-state-changed (post-import refresh)
  useEffect(() => {
    const cleanup = window.omniworkerAPI.onAppStateChanged(() => {
      // Force full app reload to pick up restored data
      window.location.reload();
    });
    return cleanup;
  }, []);

  // Listen for menu IPC events (Cmd+N, Cmd+K from app menu)
  useEffect(() => {
    const cleanupNewChat = window.omniworkerAPI.onMenuNewChat(() => {
      handleNewChat();
    });
    const cleanupSearch = window.omniworkerAPI.onMenuSearchSessions(() => {
      goTo("sessions");
    });
    return () => {
      cleanupNewChat();
      cleanupSearch();
    };
  }, [handleNewChat, goTo]);

  const handleSelectProfile = useCallback((name: string) => {
    setActiveProfile(name);
    setMessages([]);
    setCurrentSessionId(null);
  }, []);

  const handleResumeSession = useCallback(
    async (sessionId: string) => {
      const dbMessages =
        await window.omniworkerAPI.getSessionMessages(sessionId);
      const chatMessages: ChatMessage[] = dbMessages.map((m) => ({
        id: `db-${m.id}`,
        role: m.role === "user" ? "user" : "agent",
        content: m.content,
      }));
      setMessages(chatMessages);
      setCurrentSessionId(sessionId);
      goTo("chat");
    },
    [goTo],
  );

  return (
    <div className="layout">
      <aside ref={sidebarRef} className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-badge">
            OMNIWORKER
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.filter(({ view: v }) => {
            if (v === "whatsapp") return whatsappBotEnabled;
            return true;
          }).map(({ view: v, icon: Icon, labelKey }) => (
            <button
              key={v}
              className={`sidebar-nav-item ${view === v ? "active" : ""}`}
              onClick={() => goTo(v)}
            >
              <Icon size={16} />
              {t(labelKey)}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {updateState && (
            <button
              className={`sidebar-update-btn ${
                updateState === "error" ? "error" : ""
              } ${updateState === "downloading" ? "downloading" : ""}`}
              onClick={() => setShowUpdateModal(true)}
              title={updateError ?? undefined}
            >
              <Download size={13} />
              {updateState === "available" && (
                <span>
                  {t("common.updateAvailable", { version: updateVersion })}
                </span>
              )}
              {updateState === "downloading" && (
                <span>
                  {t("common.downloading", { percent: Math.round(downloadPercent) })}
                </span>
              )}
              {updateState === "ready" && (
                <span>{t("common.restartToUpdate")}</span>
              )}
              {updateState === "error" && (
                <span>{t("common.updateFailed")}</span>
              )}
            </button>
          )}
          <div
            className="sidebar-footer-text"
            style={{
              padding: "8px",
              borderTop: "1px solid var(--border-subtle)",
              marginTop: "auto",
            }}
          >
            {saasInfo ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                <div
                  style={{
                    color: "var(--text-primary)",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    fontSize: "12px",
                    letterSpacing: "0.5px",
                  }}
                >
                  {saasInfo.tenantName || "Tenant"}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    {saasInfo.plan || "Free"} Plan
                  </span>
                  {saasInfo.licenseUsage && (
                    <span
                      style={{
                        backgroundColor:
                          saasInfo.licenseUsage.active >=
                          saasInfo.licenseUsage.max
                            ? "#ef4444"
                            : "var(--bg-secondary)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        color:
                          saasInfo.licenseUsage.active >=
                          saasInfo.licenseUsage.max
                            ? "#fff"
                            : "inherit",
                      }}
                    >
                      {saasInfo.licenseUsage.active} /{" "}
                      {saasInfo.licenseUsage.max} INST
                    </span>
                  )}
                  <span
                    style={{
                      color:
                        saasInfo.tokenBalance && saasInfo.tokenBalance > 1000
                          ? "var(--text-primary)"
                          : "#ef4444",
                      fontWeight: "bold",
                    }}
                  >
                    {saasInfo.tokenBalance?.toLocaleString()} TKS
                  </span>
                </div>
              </div>
            ) : activeProfile === "default" ? (
              t("common.appName")
            ) : (
              activeProfile
            )}
          </div>
        </div>
      </aside>

      <main ref={contentRef} className="content">
        {verifyWarning && onReinstall && onDismissVerifyWarning && (
          <VerifyWarningBanner
            onReinstall={onReinstall}
            onDismiss={onDismissVerifyWarning}
          />
        )}
        <div style={paneStyle("chat")}>
          <Chat
            messages={messages}
            setMessages={setMessages}
            sessionId={currentSessionId}
            profile={activeProfile}
            onNewChat={handleNewChat}
          />
        </div>

        {visitedViews.has("sessions") && (
          <div style={paneStyle("sessions")}>
            {remoteMode ? (
              <RemoteNotice feature="Sessions" />
            ) : (
              <Sessions
                onResumeSession={handleResumeSession}
                onNewChat={handleNewChat}
                currentSessionId={currentSessionId}
                visible={view === "sessions"}
              />
            )}
          </div>
        )}

        {visitedViews.has("agents") && (
          <div style={paneStyle("agents")}>
            {remoteMode ? (
              <RemoteNotice feature="Profiles" />
            ) : (
              <Agents
                activeProfile={activeProfile}
                onSelectProfile={handleSelectProfile}
                onChatWith={(name: string) => {
                  handleSelectProfile(name);
                  goTo("chat");
                }}
              />
            )}
          </div>
        )}



        {visitedViews.has("whatsapp") && (
          <div style={paneStyle("whatsapp")}>
            {remoteMode ? (
              <RemoteNotice feature="WhatsApp Bot" />
            ) : (
              <WhatsApp visible={view === "whatsapp"} />
            )}
          </div>
        )}

        {visitedViews.has("models") && (
          <div style={paneStyle("models")}>
            <Models />
          </div>
        )}

        {visitedViews.has("providers") && (
          <div style={paneStyle("providers")}>
            {remoteMode ? (
              <RemoteNotice feature="Providers" />
            ) : (
              <Providers
                profile={activeProfile}
                visible={view === "providers"}
              />
            )}
          </div>
        )}

        {visitedViews.has("skills") && (
          <div style={paneStyle("skills")}>
            {remoteMode ? (
              <RemoteNotice feature="Skills" />
            ) : (
              <Skills profile={activeProfile} />
            )}
          </div>
        )}

        {visitedViews.has("soul") && (
          <div style={paneStyle("soul")}>
            {remoteMode ? (
              <RemoteNotice feature="Persona" />
            ) : (
              <Soul profile={activeProfile} />
            )}
          </div>
        )}

        {visitedViews.has("memory") && (
          <div style={paneStyle("memory")}>
            {remoteMode ? (
              <RemoteNotice feature="Memory" />
            ) : (
              <Memory profile={activeProfile} />
            )}
          </div>
        )}

        {visitedViews.has("tools") && (
          <div style={paneStyle("tools")}>
            {remoteMode ? (
              <RemoteNotice feature="Tools" />
            ) : (
              <Tools
                profile={activeProfile}
                onToggleToolset={(key, enabled) => {
                  if (key === "whatsapp_bot") {
                    setWhatsappBotEnabled(enabled);
                  }
                }}
              />
            )}
          </div>
        )}

        {visitedViews.has("schedules") && (
          <div style={paneStyle("schedules")}>
            <Schedules profile={activeProfile} />
          </div>
        )}

        {visitedViews.has("smartpatterns") && (
          <div style={paneStyle("smartpatterns")}>
            <SmartPatterns profile={activeProfile} />
          </div>
        )}

        {visitedViews.has("kanban") && (
          <div style={paneStyle("kanban")}>
            {remoteMode ? (
              <RemoteNotice feature="Kanban" />
            ) : (
              <Kanban profile={activeProfile} visible={view === "kanban"} />
            )}
          </div>
        )}

        {visitedViews.has("gateway") && (
          <div style={paneStyle("gateway")}>
            {remoteMode ? (
              <RemoteNotice feature="Gateway" />
            ) : (
              <Gateway profile={activeProfile} />
            )}
          </div>
        )}

        {visitedViews.has("settings") && (
          <div style={paneStyle("settings")}>
            <Settings profile={activeProfile} />
          </div>
        )}

        {visitedViews.has("account") && (
          <div style={paneStyle("account")}>
            <Account userData={userData} authToken={authToken} onLogout={onLogout} />
          </div>
        )}
      </main>

      {/* Modal de Actualización Premium */}
      {showUpdateModal && updateState && (
        <div className="update-modal-overlay">
          <div className="update-modal-card">
            <div className="update-modal-header">
              <div className="update-modal-icon-wrapper">
                <Download size={22} />
              </div>
              <div className="update-modal-title-container">
                <h3 className="update-modal-title">
                  {updateState === "available" && "Nueva versión disponible"}
                  {updateState === "downloading" && "Descargando OmniWorker"}
                  {updateState === "ready" && "¡Actualización Lista!"}
                  {updateState === "error" && "Error en la actualización"}
                </h3>
                {updateVersion && (
                  <span className="update-modal-version-tag">
                    v{updateVersion}
                  </span>
                )}
              </div>
            </div>

            <div className="update-modal-body">
              {updateState === "available" && (
                <div className="space-y-3">
                  <p>
                    Una nueva versión de OmniWorker está disponible para su descarga. Incluye mejoras de rendimiento, parches de seguridad y nuevas capacidades inteligentes para tus agentes.
                  </p>
                  {saasReleaseNotes && (
                    <div className="mt-3 p-3 bg-zinc-950/60 border border-zinc-800 rounded-sm text-left font-mono">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Notas de la versión:</span>
                      <div className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">{saasReleaseNotes}</div>
                    </div>
                  )}
                </div>
              )}
              {updateState === "downloading" && (
                "Se está descargando la nueva versión. Puedes minimizar esta ventana y continuar trabajando; el proceso se completará en segundo plano."
              )}
              {updateState === "ready" && (
                "La nueva versión se ha descargado correctamente. Reinicia la aplicación ahora para aplicar la actualización y disfrutar de las últimas novedades."
              )}
              {updateState === "error" && (
                "Ha ocurrido un problema al intentar descargar la nueva versión. Por favor, verifica tu conexión a internet o inténtalo de nuevo."
              )}

              {updateState === "error" && updateError && (
                <div className="update-modal-error-box">
                  <code>{updateError}</code>
                </div>
              )}
            </div>

            {updateState === "downloading" && (
              <div className="update-modal-progress-container">
                <div className="update-modal-progress-info">
                  <span>Descargando...</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(downloadPercent)}%
                  </span>
                </div>
                <div className="update-modal-progress-bar">
                  <div
                    className="update-modal-progress-fill"
                    style={{ width: `${downloadPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="update-modal-actions">
              {updateState === "available" && (
                <>
                  <button
                    className="update-modal-btn-secondary"
                    onClick={() => setShowUpdateModal(false)}
                  >
                    Recordar más tarde
                  </button>
                  <button
                    className="update-modal-btn-primary"
                    onClick={handleUpdate}
                  >
                    Actualizar ahora
                  </button>
                </>
              )}

              {updateState === "downloading" && (
                <button
                  className="update-modal-btn-secondary"
                  onClick={() => setShowUpdateModal(false)}
                  style={{ width: "100%" }}
                >
                  Minimizar y continuar en segundo plano
                </button>
              )}

              {updateState === "ready" && (
                <>
                  <button
                    className="update-modal-btn-secondary"
                    onClick={() => setShowUpdateModal(false)}
                  >
                    Más tarde
                  </button>
                  <button
                    className="update-modal-btn-primary"
                    onClick={handleUpdate}
                    style={{
                      boxShadow: "0 0 16px rgba(212, 255, 0, 0.4)",
                      border: "1px solid var(--accent)",
                    }}
                  >
                    Reiniciar y Aplicar
                  </button>
                </>
              )}

              {updateState === "error" && (
                <>
                  <button
                    className="update-modal-btn-secondary"
                    onClick={() => setShowUpdateModal(false)}
                  >
                    Cerrar
                  </button>
                  <button
                    className="update-modal-btn-primary"
                    onClick={handleUpdate}
                  >
                    Reintentar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Layout;
