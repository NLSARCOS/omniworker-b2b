import { useState, useEffect, useCallback } from "react";
import { Plus, Trash, ChatBubble } from "../../assets/icons";
import OmniWorkerLogo from "../../components/common/OmniWorkerLogo";
import { useI18n } from "../../components/useI18n";

interface ProfileInfo {
  name: string;
  path: string;
  isDefault: boolean;
  isActive: boolean;
  model: string;
  provider: string;
  hasEnv: boolean;
  hasSoul: boolean;
  skillCount: number;
  gatewayRunning: boolean;
}

interface AgentsProps {
  activeProfile: string;
  onSelectProfile: (name: string) => void;
  onChatWith: (name: string) => void;
}

function AgentAvatar({ name }: { name: string }): React.JSX.Element {
  if (name === "default") {
    return (
      <div className="agents-card-avatar agents-card-avatar-icon">
        <OmniWorkerLogo size={22} />
      </div>
    );
  }
  return (
    <div className="agents-card-avatar">{name.charAt(0).toUpperCase()}</div>
  );
}

interface RolePreset {
  key: string;
  name: string;
  description: string;
  prompt: string;
  color: string;
}

const ROLE_PRESETS: RolePreset[] = [
  {
    key: "communications",
    name: "Comunicaciones",
    description: "Experto en redacción cordial, profesional y clara.",
    color: "var(--accent)",
    prompt: "Eres un agente experto en redactar comunicados claros, cordiales y profesionales. Tu objetivo es redactar correos, mensajes de chat y reportes estructurados con una ortografía y estilo impecable, asegurando una voz de marca coherente."
  },
  {
    key: "sales",
    name: "Ventas",
    description: "Persuasivo, empático y enfocado en cerrar negocios.",
    color: "#10b981",
    prompt: "Eres un agente de ventas altamente persuasivo y consultivo. Tu objetivo es calificar prospectos, responder a objeciones con empatía y enfocarte en generar valor para cerrar negocios. Tu tono debe ser entusiasta, seguro y servicial. Tu principal herramienta es el correo electrónico."
  },
  {
    key: "developer",
    name: "Desarrollador",
    description: "Ingeniero experto, lógico y de gran rigor técnico.",
    color: "#8b5cf6",
    prompt: "Eres un ingeniero de software experto de nivel senior. Diseñas soluciones técnicas limpias, explicas conceptos arquitectónicos de manera lógica, escribes código legible and robusto, y ayudas a diagnosticar errores técnicos con total rigor científico."
  },
  {
    key: "support",
    name: "Atención al Cliente",
    description: "Paciente, empático y resolviendo dudas paso a paso.",
    color: "#f59e0b",
    prompt: "Eres un agente de atención al cliente empático y dedicado. Tu misión es escuchar con paciencia las inquietudes del usuario, responder con instrucciones claras paso a paso, calmar situaciones tensas y resolver los problemas reportados con la máxima cordialidad."
  },
  {
    key: "custom",
    name: "Personalizado",
    description: "Define tu propia personalidad y objetivos en detalle.",
    color: "#6b7280",
    prompt: ""
  }
];

interface ToolsetItem {
  key: string;
  name: string;
  description: string;
}

const TOOLSET_ITEMS: ToolsetItem[] = [
  { key: "smtp_client", name: "Correo Electrónico", description: "Enviar y recibir correos mediante SMTP e IMAP." },
  { key: "terminal", name: "Consola de Comandos", description: "Ejecutar comandos en la consola local o remota." },
  { key: "file", name: "Gestión de Archivos", description: "Crear, editar, leer y buscar archivos en el disco." },
  { key: "web", name: "Búsqueda Web", description: "Buscar en Internet y extraer texto de páginas web." },
  { key: "browser", name: "Navegador Web", description: "Automatización de navegador completo con Playwright." }
];

function Agents({
  activeProfile,
  onSelectProfile,
  onChatWith,
}: AgentsProps): React.JSX.Element {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [cloneConfig, setCloneConfig] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Advanced States
  const [selectedRolePreset, setSelectedRolePreset] = useState("communications");
  const [customSoulPrompt, setCustomSoulPrompt] = useState("");
  const [enabledTools, setEnabledTools] = useState<string[]>([
    "smtp_client",
    "terminal",
    "file",
    "web",
    "browser",
    "skills",
    "todo",
    "tts",
    "cronjob",
  ]);

  const loadProfiles = useCallback(async (): Promise<void> => {
    const list = await window.omniworkerAPI.listProfiles();
    setProfiles(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  async function handleCreate(): Promise<void> {
    const name = newName.trim().toLowerCase();
    if (!name) return;
    setCreating(true);
    setError("");

    const soulPrompt = selectedRolePreset === "custom"
      ? customSoulPrompt.trim()
      : ROLE_PRESETS.find((p) => p.key === selectedRolePreset)?.prompt || "";

    const ALL_TOOLSETS = [
      "smtp_client",
      "terminal",
      "file",
      "web",
      "browser",
      "skills",
      "todo",
      "tts",
      "cronjob",
    ];
    const disabledToolsets = ALL_TOOLSETS.filter((t) => !enabledTools.includes(t));

    const options = {
      soulPrompt,
      disabledToolsets,
    };

    const result = await window.omniworkerAPI.createProfile(name, cloneConfig, options);
    setCreating(false);
    if (result.success) {
      setShowCreate(false);
      setNewName("");
      setSelectedRolePreset("communications");
      setCustomSoulPrompt("");
      setEnabledTools([
        "smtp_client",
        "terminal",
        "file",
        "web",
        "browser",
        "skills",
        "todo",
        "tts",
        "cronjob",
      ]);
      loadProfiles();
    } else {
      setError(result.error || t("agents.createFailed"));
    }
  }

  async function handleDelete(name: string): Promise<void> {
    const result = await window.omniworkerAPI.deleteProfile(name);
    if (result.success) {
      if (activeProfile === name) onSelectProfile("default");
      loadProfiles();
    }
    setConfirmDelete(null);
  }

  async function handleSelect(name: string): Promise<void> {
    await window.omniworkerAPI.setActiveProfile(name);
    onSelectProfile(name);
    loadProfiles();
  }

  function providerLabel(provider: string): string {
    if (!provider || provider === "auto") return t("agents.auto");
    if (provider === "custom") return t("agents.local");
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  if (loading) {
    return (
      <div className="agents-container">
        <div className="agents-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="agents-container">
      <div className="agents-header">
        <div>
          <h2 className="agents-title">{t("agents.title")}</h2>
          <p className="agents-subtitle">{t("agents.subtitle")}</p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={14} />
          {t("agents.newAgent")}
        </button>
      </div>

      {showCreate && (
        <div className="agents-create-premium">
          <style>{`
            .agents-create-premium {
              background: var(--bg-secondary);
              border: 1px solid var(--border-bright);
              border-radius: var(--radius-md);
              padding: 20px;
              margin-bottom: 20px;
              display: flex;
              flex-direction: column;
              gap: 16px;
              animation: slideDown 0.25s ease-out;
            }
            @keyframes slideDown {
              from { opacity: 0; transform: translateY(-8px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .form-section {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            .form-section-title {
              font-size: 12px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: var(--text-secondary);
              margin-bottom: 2px;
              border-left: 3px solid var(--accent);
              padding-left: 8px;
            }
            .form-section-desc {
              font-size: 11.5px;
              color: var(--text-muted);
              margin-bottom: 6px;
            }
            .role-presets-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
              gap: 10px;
            }
            .role-preset-card {
              border: 1.5px solid var(--border);
              border-radius: var(--radius-sm);
              padding: 12px;
              cursor: pointer;
              transition: all var(--transition);
              display: flex;
              flex-direction: column;
              gap: 4px;
              background: var(--bg-primary);
            }
            .role-preset-card:hover {
              border-color: var(--border-bright);
              transform: translateY(-1px);
            }
            .role-preset-card.active {
              border-color: var(--accent);
              background: var(--accent-subtle);
            }
            .role-preset-name {
              font-size: 13px;
              font-weight: 600;
              color: var(--text-primary);
            }
            .role-preset-desc {
              font-size: 10.5px;
              color: var(--text-muted);
              line-height: 1.35;
            }
            .toolsets-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
              gap: 8px;
            }
            .toolset-card {
              border: 1.5px solid var(--border);
              border-radius: var(--radius-sm);
              padding: 10px;
              cursor: pointer;
              transition: all var(--transition);
              display: flex;
              align-items: flex-start;
              gap: 8px;
              background: var(--bg-primary);
              user-select: none;
            }
            .toolset-card:hover {
              border-color: var(--border-bright);
            }
            .toolset-card.active {
              border-color: var(--accent);
              background: var(--accent-subtle);
            }
            .toolset-checkbox {
              margin-top: 2px;
              accent-color: var(--accent);
            }
            .toolset-content {
              display: flex;
              flex-direction: column;
              gap: 1px;
            }
            .toolset-name-row {
              display: flex;
              align-items: center;
              gap: 4px;
            }
            .toolset-name {
              font-size: 12px;
              font-weight: 600;
              color: var(--text-primary);
            }
            .toolset-desc {
              font-size: 10.5px;
              color: var(--text-muted);
              line-height: 1.3;
            }
            .custom-soul-textarea {
              min-height: 80px;
              font-family: var(--font-sans);
              font-size: 12.5px;
              line-height: 1.45;
              padding: 8px 10px;
              border: 1.5px solid var(--border);
              border-radius: var(--radius-sm);
              background: var(--bg-primary);
              color: var(--text-primary);
              resize: vertical;
              outline: none;
              transition: border-color var(--transition);
            }
            .custom-soul-textarea:focus {
              border-color: var(--accent);
            }
          `}</style>

          <div className="form-section">
            <div className="form-section-title">Nombre del Agente</div>
            <input
              className="input"
              placeholder="Ej. agente_ventas, comunicaciones, etc."
              value={newName}
              onChange={(e) => {
                const v = e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]/g, "");
                setNewName(v);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <label className="agents-create-clone" style={{ marginTop: '4px' }}>
              <input
                type="checkbox"
                checked={cloneConfig}
                onChange={(e) => setCloneConfig(e.target.checked)}
              />
              <span>Clonar configuraciones básicas del perfil default</span>
            </label>
          </div>

          <div className="form-section">
            <div className="form-section-title">Rol y Personalidad (Soul)</div>
            <div className="form-section-desc">Selecciona un rol predefinido para moldear cómo se comportará y hablará el agente, o escribe tus propias directrices.</div>
            <div className="role-presets-grid">
              {ROLE_PRESETS.map((preset) => (
                <div
                  key={preset.key}
                  className={`role-preset-card ${selectedRolePreset === preset.key ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedRolePreset(preset.key);
                    if (preset.key !== "custom") {
                      setCustomSoulPrompt(preset.prompt);
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: preset.color, display: 'inline-block' }} />
                    <div className="role-preset-name">{preset.name}</div>
                  </div>
                  <div className="role-preset-desc">{preset.description}</div>
                </div>
              ))}
            </div>
            
            {selectedRolePreset === "custom" && (
              <textarea
                className="custom-soul-textarea"
                placeholder="Escribe aquí las instrucciones de comportamiento... Ej: 'Eres un agente de ventas enfocado en vender servicios de consultoría. Tu tono debe ser persuasivo y tu principal herramienta es el correo electrónico...'"
                value={customSoulPrompt}
                onChange={(e) => setCustomSoulPrompt(e.target.value)}
              />
            )}
          </div>

          <div className="form-section">
            <div className="form-section-title">Herramientas Primarias</div>
            <div className="form-section-desc">Activa las herramientas principales que tu agente tendrá permitido utilizar para realizar sus tareas.</div>
            <div className="toolsets-grid">
              {TOOLSET_ITEMS.map((tool) => {
                const isActive = enabledTools.includes(tool.key);
                return (
                  <div
                    key={tool.key}
                    className={`toolset-card ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (isActive) {
                        setEnabledTools(enabledTools.filter(k => k !== tool.key));
                      } else {
                        setEnabledTools([...enabledTools, tool.key]);
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      className="toolset-checkbox"
                      checked={isActive}
                      readOnly
                    />
                    <div className="toolset-content">
                      <div className="toolset-name-row">
                        <span className="toolset-name">{tool.name}</span>
                      </div>
                      <div className="toolset-desc">{tool.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div className="agents-create-error">{error}</div>}
          
          <div className="agents-create-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? t("agents.creating") : "Crear Agente"}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowCreate(false);
                setError("");
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="agents-grid">
        {profiles.map((p) => (
          <div
            key={p.name}
            className={`agents-card ${activeProfile === p.name ? "active" : ""}`}
            onClick={() => handleSelect(p.name)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSelect(p.name);
            }}
          >
            <div className="agents-card-header">
              <AgentAvatar name={p.name} />
              <div className="agents-card-info">
                <div className="agents-card-name">{p.name}</div>
                <div className="agents-card-provider">
                  {providerLabel(p.provider)}
                </div>
              </div>
              {activeProfile === p.name && (
                <span className="agents-card-active-badge">
                  {t("agents.active")}
                </span>
              )}
            </div>
            <div className="agents-card-model">
              {p.model ? p.model.split("/").pop() : "omniworker"}
            </div>
            <div className="agents-card-stats">
              <span>{t("agents.skillsCount", { count: p.skillCount })}</span>
              <span className="agents-card-dot" />
              {p.gatewayRunning ? (
                <span className="agents-card-gateway-on">
                  {t("agents.gatewayRunning")}
                </span>
              ) : (
                <span>{t("agents.gatewayOff")}</span>
              )}
            </div>
            <div className="agents-card-footer">
              <button
                className="btn btn-primary btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onChatWith(p.name);
                }}
              >
                <ChatBubble size={13} />
                {t("agents.chat")}
              </button>
              {!p.isDefault &&
                (confirmDelete === p.name ? (
                  <div
                    className="agents-card-confirm-delete"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{t("agents.deleteConfirm")}</span>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.name);
                      }}
                    >
                      {t("agents.yes")}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(null);
                      }}
                    >
                      {t("agents.no")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="agents-card-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(p.name);
                    }}
                    title={t("agents.deleteTitle")}
                  >
                    <Trash size={14} />
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Agents;
