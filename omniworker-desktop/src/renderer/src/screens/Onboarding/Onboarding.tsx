import { useState } from "react";
import OmniWorkerLogo from "../../components/common/OmniWorkerLogo";
import { ArrowRight, ArrowLeft, Spinner } from "../../assets/icons";

interface OnboardingProps {
  onComplete: () => void;
}

type OnboardingRole = "normal" | "coder";
type OnboardingTone = "direct" | "collaborative" | "academic";

export function Onboarding({ onComplete }: OnboardingProps): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("Español");
  const [role, setRole] = useState<OnboardingRole>("normal");
  const [agentGoal, setAgentGoal] = useState("");
  const [agentTasks, setAgentTasks] = useState("");
  const [autolearning, setAutolearning] = useState(true);
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [tone, setTone] = useState<OnboardingTone>("collaborative");
  const [proactivity, setProactivity] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 3;

  const handleNext = (): void => {
    if (step === 1 && !userName.trim()) {
      setError("Por favor, introduce tu nombre para continuar.");
      return;
    }
    setError(null);
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = (): void => {
    setError(null);
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleFinish = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const res = await window.omniworkerAPI.saveOnboardingData({
        userName: userName.trim(),
        language,
        role,
        tone,
        proactivity,
        agentGoal: agentGoal.trim(),
        agentTasks: agentTasks.trim(),
        customMission: `${agentGoal.trim()}\n\n${agentTasks.trim()}`,
        autolearning,
        gatewayEnabled,
      });

      if (res.success) {
        if (gatewayEnabled) {
          try {
            await window.omniworkerAPI.startGateway();
          } catch (e) {
            console.error("Failed to start gateway:", e);
          }
        }
        onComplete();
      } else {
        setError(res.error || "Ocurrió un error al guardar tu configuración.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen onboarding-screen">
      <div className="onboarding-overlay"></div>
      
      <div className="onboarding-container">
        {/* Header with logo & title */}
        <div className="onboarding-header">
          <OmniWorkerLogo size={42} />
          {step > 0 && (
            <div className="onboarding-progress-container">
              <div className="onboarding-steps-text">
                Paso {step} de {totalSteps}
              </div>
              <div className="onboarding-progress-bar-bg">
                <div 
                  className="onboarding-progress-bar-fill" 
                  style={{ width: `${(step / totalSteps) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Step Cards */}
        <div className="onboarding-card-wrapper">
          {/* STEP 0: Cinematic Welcome */}
          {step === 0 && (
            <div className="onboarding-step-content step-fade-in">
              <h1 className="onboarding-title">Configuración de tu OmniWorker</h1>
              <p className="onboarding-description">
                Personaliza tu asistente inteligente en tres sencillos pasos para alinearlo perfectamente con tu flujo de trabajo diario y tus preferencias.
              </p>
              <div className="onboarding-actions" style={{ justifyContent: "center", marginTop: 32 }}>
                <button className="btn btn-primary welcome-button animate-pulse" onClick={handleNext}>
                  Comenzar Configuración
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: Identity */}
          {step === 1 && (
            <div className="onboarding-step-content step-fade-in">
              <h1 className="onboarding-title">¿Con quién colaboro hoy?</h1>
              <p className="onboarding-description">
                Dime tu nombre para saludarte y personalizar todas nuestras futuras interacciones y reportes de trabajo.
              </p>
              <div className="onboarding-form-group">
                <label className="onboarding-label">Tu Nombre</label>
                <input
                  type="text"
                  className="onboarding-input"
                  placeholder="Introduce tu nombre..."
                  value={userName}
                  onChange={(e) => {
                    setUserName(e.target.value);
                    if (e.target.value.trim()) setError(null);
                  }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNext();
                  }}
                />
                
                <label className="onboarding-label" style={{ marginTop: 24 }}>Idioma de Preferencia</label>
                <select 
                  className="onboarding-input select-input"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="Español">Español (Castellano / América Latina)</option>
                  <option value="English">English (United States / United Kingdom)</option>
                  <option value="Português">Português</option>
                  <option value="Français">Français</option>
                </select>
              </div>

              {error && <p className="onboarding-form-error">{error}</p>}

              <div className="onboarding-actions" style={{ marginTop: 32 }}>
                <button className="btn-ghost" onClick={handleBack}>
                  <ArrowLeft size={16} />
                  Atrás
                </button>
                <button className="btn btn-primary" onClick={handleNext} disabled={!userName.trim()}>
                  Siguiente
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Mission & Role (Normal vs Coder + Custom Mission input) */}
          {step === 2 && (
            <div className="onboarding-step-content step-fade-in">
              <h1 className="onboarding-title">¿Cuál será mi enfoque y funciones?</h1>
              <p className="onboarding-description">
                Selecciona la especialidad de tu OmniWorker y describe en tus propias palabras qué fin o tareas específicas deseas que realice.
              </p>
              
              <div className="onboarding-grid-roles" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {/* Normal Agent */}
                <div 
                  className={`onboarding-role-card ${role === "normal" ? "active" : ""}`}
                  onClick={() => setRole("normal")}
                  style={{ minHeight: 160 }}
                >
                  <div className="role-accent-dot color-exec"></div>
                  <h3 className="role-title">💼 Agente Normal</h3>
                  <p className="role-desc" style={{ fontSize: 11.5 }}>
                    Optimizado para labores administrativas de oficina, envíos de correo, automatización de mensajería, gestión de archivos y búsquedas web.
                  </p>
                </div>

                {/* Coder Agent */}
                <div 
                  className={`onboarding-role-card ${role === "coder" ? "active" : ""}`}
                  onClick={() => setRole("coder")}
                  style={{ minHeight: 160 }}
                >
                  <div className="role-accent-dot color-dev"></div>
                  <h3 className="role-title">💻 Agente Coder</h3>
                  <p className="role-desc" style={{ fontSize: 11.5 }}>
                    Especializado en ingeniería de software. Optimizado para escribir código limpio, ejecutar comandos en consola, debugging y testing.
                  </p>
                </div>
              </div>

              {/* Structured Inputs for Agent Purpose and Tasks */}
              <div className="onboarding-form-group" style={{ marginTop: 24 }}>
                <label className="onboarding-label">🎯 ¿Cuál es el fin u objetivo principal de tu agente?</label>
                <input
                  type="text"
                  className="onboarding-input"
                  style={{ marginTop: 4, fontSize: 13 }}
                  placeholder="Ej. Ayudarme a analizar reportes de ventas, gestionar soporte, o Escribir tests"
                  value={agentGoal}
                  onChange={(e) => setAgentGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNext();
                  }}
                />
              </div>

              <div className="onboarding-form-group" style={{ marginTop: 16 }}>
                <label className="onboarding-label">📋 ¿Qué tareas o actividades específicas va a realizar?</label>
                <textarea
                  className="onboarding-input"
                  style={{ minHeight: 70, resize: "vertical", fontFamily: "inherit", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}
                  placeholder="Ej. Responder correos de clientes, hacer resúmenes de reuniones, o programar utilidades"
                  value={agentTasks}
                  onChange={(e) => setAgentTasks(e.target.value)}
                />
              </div>

              <div className="onboarding-actions" style={{ marginTop: 28 }}>
                <button className="btn-ghost" onClick={handleBack}>
                  <ArrowLeft size={16} />
                  Atrás
                </button>
                <button className="btn btn-primary" onClick={handleNext}>
                  Siguiente
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Tone, Proactivity & Finalize */}
          {step === 3 && (
            <div className="onboarding-step-content step-fade-in">
              <h1 className="onboarding-title">Personalidad y Comportamiento</h1>
              <p className="onboarding-description">
                Elige el tono en el que debo expresarme y mi nivel de autonomía para hacerte sugerencias como copiloto.
              </p>

              <div className="onboarding-form-group">
                <label className="onboarding-label">Tono de Voz</label>
                <div className="onboarding-grid-roles" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  <div 
                    className={`onboarding-role-card ${tone === "direct" ? "active" : ""}`}
                    onClick={() => setTone("direct")}
                  >
                    <h4 className="role-title" style={{ fontSize: 14 }}>⚡ Directo</h4>
                    <p className="role-desc" style={{ fontSize: 11 }}>Respuestas cortas y enfocadas. Va directo al código o respuesta.</p>
                  </div>
                  <div 
                    className={`onboarding-role-card ${tone === "collaborative" ? "active" : ""}`}
                    onClick={() => setTone("collaborative")}
                  >
                    <h4 className="role-title" style={{ fontSize: 14 }}>🤝 Colaborador</h4>
                    <p className="role-desc" style={{ fontSize: 11 }}>Co-piloto activo. Explica su enfoque y pide feedback.</p>
                  </div>
                  <div 
                    className={`onboarding-role-card ${tone === "academic" ? "active" : ""}`}
                    onClick={() => setTone("academic")}
                  >
                    <h4 className="role-title" style={{ fontSize: 14 }}>🎓 Académico</h4>
                    <p className="role-desc" style={{ fontSize: 11 }}>Explicativo. Detalla fundamentos teóricos y mejores prácticas.</p>
                  </div>
                </div>

                <div className="onboarding-proactivity-switch">
                  <div className="switch-text-block">
                    <label className="onboarding-label" style={{ margin: 0 }}>Autonomía Proactiva</label>
                    <p className="role-desc" style={{ fontSize: 12, marginTop: 4 }}>
                      {proactivity 
                        ? "Te sugeriré proactivamente mejoras de optimización, seguridad y estilo." 
                        : "Me limitaré estrictamente a responder lo que me preguntes directamente."}
                    </p>
                  </div>
                  <button 
                    className={`onboarding-toggle-btn ${proactivity ? "on" : "off"}`}
                    onClick={() => setProactivity(!proactivity)}
                  >
                    <div className="toggle-slider"></div>
                  </button>
                </div>

                <div className="onboarding-proactivity-switch" style={{ marginTop: 16 }}>
                  <div className="switch-text-block">
                    <label className="onboarding-label" style={{ margin: 0 }}>Auto-aprendizaje Activo</label>
                    <p className="role-desc" style={{ fontSize: 12, marginTop: 4 }}>
                      {autolearning 
                        ? "El agente identificará patrones en tus comandos y te sugerirá automatizaciones (tareas Cron) personalizadas." 
                        : "El agente operará en modo estático sin sugerir automatizaciones de comportamiento."}
                    </p>
                  </div>
                  <button 
                    className={`onboarding-toggle-btn ${autolearning ? "on" : "off"}`}
                    onClick={() => setAutolearning(!autolearning)}
                  >
                    <div className="toggle-slider"></div>
                  </button>
                </div>

                <div className="onboarding-proactivity-switch" style={{ marginTop: 16 }}>
                  <div className="switch-text-block">
                    <label className="onboarding-label" style={{ margin: 0 }}>Pasarela de Mensajería (Gateway)</label>
                    <p className="role-desc" style={{ fontSize: 12, marginTop: 4 }}>
                      {gatewayEnabled 
                        ? "Habilita el chatbot en segundo plano para Telegram, WhatsApp, Slack o Discord." 
                        : "Desactiva las pasarelas externas; solo responderé desde la interfaz de escritorio."}
                    </p>
                    <p className="role-desc" style={{ fontSize: 11, color: "var(--accent-subtle)", marginTop: 6, fontStyle: "italic" }}>
                      💡 El Gateway y el Chat local trabajan en paralelo de forma simultánea, compartiendo la misma base de conocimiento y memoria sin interferencias.
                    </p>
                  </div>
                  <button 
                    className={`onboarding-toggle-btn ${gatewayEnabled ? "on" : "off"}`}
                    onClick={() => setGatewayEnabled(!gatewayEnabled)}
                  >
                    <div className="toggle-slider"></div>
                  </button>
                </div>
              </div>

              {error && <p className="onboarding-form-error">{error}</p>}

              <div className="onboarding-actions" style={{ marginTop: 32 }}>
                <button className="btn-ghost" onClick={handleBack} disabled={saving}>
                  <ArrowLeft size={16} />
                  Atrás
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleFinish} 
                  disabled={saving}
                  style={{ minWidth: 160 }}
                >
                  {saving ? (
                    <>
                      Configurando...
                      <Spinner size={14} className="animate-spin" />
                    </>
                  ) : (
                    <>
                      Finalizar Configuración
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
