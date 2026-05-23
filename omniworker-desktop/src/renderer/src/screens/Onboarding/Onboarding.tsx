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
      });

      if (res.success) {
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
              <h1 className="onboarding-title">Alineación de Alma</h1>
              <p className="onboarding-description">
                Bienvenido a tu OmniWorker. Configuremos tu agente para que se adapte exactamente a ti, tu lenguaje y tu estilo de trabajo preferido desde el primer segundo.
              </p>
              <div className="onboarding-actions" style={{ justifyContent: "center", marginTop: 32 }}>
                <button className="btn btn-primary welcome-button animate-pulse" onClick={handleNext}>
                  Comenzar Alineación
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

          {/* STEP 2: Mission & Role (Normal vs Coder) */}
          {step === 2 && (
            <div className="onboarding-step-content step-fade-in">
              <h1 className="onboarding-title">¿Cuál será mi enfoque?</h1>
              <p className="onboarding-description">
                Selecciona la especialidad de tu OmniWorker. Esto habilitará solo las herramientas y capacidades óptimas para tus tareas.
              </p>
              
              <div className="onboarding-grid-roles" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {/* Normal Agent */}
                <div 
                  className={`onboarding-role-card ${role === "normal" ? "active" : ""}`}
                  onClick={() => setRole("normal")}
                  style={{ minHeight: 180 }}
                >
                  <div className="role-accent-dot color-exec"></div>
                  <h3 className="role-title">💼 Agente Normal</h3>
                  <p className="role-desc">
                    Optimizado para labores administrativas de oficina, envíos de correo, automatización de mensajería, gestión de archivos y búsquedas web.
                  </p>
                </div>

                {/* Coder Agent */}
                <div 
                  className={`onboarding-role-card ${role === "coder" ? "active" : ""}`}
                  onClick={() => setRole("coder")}
                  style={{ minHeight: 180 }}
                >
                  <div className="role-accent-dot color-dev"></div>
                  <h3 className="role-title">💻 Agente Coder</h3>
                  <p className="role-desc">
                    Especializado en ingeniería de software. Optimizado para escribir código limpio, ejecutar comandos en consola, debugging y testing.
                  </p>
                </div>
              </div>

              <div className="onboarding-actions" style={{ marginTop: 32 }}>
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
              <h1 className="onboarding-title">Personalidad y Alineación</h1>
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
                      Alineando...
                      <Spinner size={14} className="animate-spin" />
                    </>
                  ) : (
                    <>
                      Completar Alineación
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
