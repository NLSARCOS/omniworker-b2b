import { useState } from "react";
import OmniWorkerLogo from "../../components/common/OmniWorkerLogo";
import { ArrowRight, ArrowLeft, Spinner } from "../../assets/icons";

interface OnboardingProps {
  onComplete: () => void;
}

type OnboardingRole = "developer" | "gateway" | "executive" | "creative";
type OnboardingTone = "direct" | "collaborative" | "academic";

export function Onboarding({ onComplete }: OnboardingProps): React.JSX.Element {
  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("Español");
  const [role, setRole] = useState<OnboardingRole>("developer");
  const [tone, setTone] = useState<OnboardingTone>("collaborative");
  const [proactivity, setProactivity] = useState(true);
  const [engine, setEngine] = useState<"local" | "cloud">("local");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 4;

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
        engine,
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
                Bienvenido a OmniWorker, tu compañero inteligente de auto-aprendizaje.
                Antes de comenzar a trabajar, configuremos tu agente para que se adapte exactamente a tus necesidades, lenguaje y estilo personal.
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

          {/* STEP 2: Mission & Role */}
          {step === 2 && (
            <div className="onboarding-step-content step-fade-in">
              <h1 className="onboarding-title">¿Cuál será mi misión?</h1>
              <p className="onboarding-description">
                Elige mi entorno principal de especialidad. Esto inyectará el conjunto de herramientas (toolsets) correspondiente de forma optimizada.
              </p>
              
              <div className="onboarding-grid-roles">
                {/* Developer */}
                <div 
                  className={`onboarding-role-card ${role === "developer" ? "active" : ""}`}
                  onClick={() => setRole("developer")}
                >
                  <div className="role-accent-dot color-dev"></div>
                  <h3 className="role-title">Ingeniero de Software</h3>
                  <p className="role-desc">
                    Optimizado para escribir código limpio, refactorizar, diagnosticar errores y automatizar testing.
                  </p>
                </div>

                {/* Gateway */}
                <div 
                  className={`onboarding-role-card ${role === "gateway" ? "active" : ""}`}
                  onClick={() => setRole("gateway")}
                >
                  <div className="role-accent-dot color-gateway"></div>
                  <h3 className="role-title">Coordinador de Canales</h3>
                  <p className="role-desc">
                    Especializado en automatizaciones con Telegram y WhatsApp. Ideal para bots autónomos.
                  </p>
                </div>

                {/* Executive */}
                <div 
                  className={`onboarding-role-card ${role === "executive" ? "active" : ""}`}
                  onClick={() => setRole("executive")}
                >
                  <div className="role-accent-dot color-exec"></div>
                  <h3 className="role-title">Asistente de Datos</h3>
                  <p className="role-desc">
                    Generación de reportes de ventas, lectura de documentación densa, manejo de correos e investigación web.
                  </p>
                </div>

                {/* Creative */}
                <div 
                  className={`onboarding-role-card ${role === "creative" ? "active" : ""}`}
                  onClick={() => setRole("creative")}
                >
                  <div className="role-accent-dot color-creative"></div>
                  <h3 className="role-title">Co-Piloto Creativo</h3>
                  <p className="role-desc">
                    Alineado para tormentas de ideas, explicaciones paso a paso de conceptos complejos y edición de texto.
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

          {/* STEP 3: Tone & Proactivity */}
          {step === 3 && (
            <div className="onboarding-step-content step-fade-in">
              <h1 className="onboarding-title">Personalidad y Comunicación</h1>
              <p className="onboarding-description">
                Elige el tono en el que debo expresarme y mi nivel de autonomía para hacerte sugerencias en caliente.
              </p>

              <div className="onboarding-form-group">
                <label className="onboarding-label">Tono de Voz</label>
                <div className="onboarding-grid-roles" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  <div 
                    className={`onboarding-role-card ${tone === "direct" ? "active" : ""}`}
                    onClick={() => setTone("direct")}
                  >
                    <h4 className="role-title" style={{ fontSize: 14 }}>⚡ Directo (No-Fluff)</h4>
                    <p className="role-desc" style={{ fontSize: 11 }}>Code-first, respuestas sin rodeos, sin disculpas de relleno.</p>
                  </div>
                  <div 
                    className={`onboarding-role-card ${tone === "collaborative" ? "active" : ""}`}
                    onClick={() => setTone("collaborative")}
                  >
                    <h4 className="role-title" style={{ fontSize: 14 }}>🤝 Colaborador</h4>
                    <p className="role-desc" style={{ fontSize: 11 }}>Par de programación. Comparte su lógica antes de cambiar código.</p>
                  </div>
                  <div 
                    className={`onboarding-role-card ${tone === "academic" ? "active" : ""}`}
                    onClick={() => setTone("academic")}
                  >
                    <h4 className="role-title" style={{ fontSize: 14 }}>🎓 Académico</h4>
                    <p className="role-desc" style={{ fontSize: 11 }}>Explicativo. Detalla cada parte del fondo teórico e implicaciones.</p>
                  </div>
                </div>

                <div className="onboarding-proactivity-switch">
                  <div className="switch-text-block">
                    <label className="onboarding-label" style={{ margin: 0 }}>Autonomía Proactiva</label>
                    <p className="role-desc" style={{ fontSize: 12, marginTop: 4 }}>
                      {proactivity 
                        ? "Buscaré errores de seguridad y optimizaciones proactivamente en tu código." 
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

          {/* STEP 4: Engine Selection & Finalize */}
          {step === 4 && (
            <div className="onboarding-step-content step-fade-in">
              <h1 className="onboarding-title">Selección del Motor LLM</h1>
              <p className="onboarding-description">
                Elige dónde vivirá mi capacidad de procesamiento inicial. Puedes agregar otros modelos y llaves más adelante.
              </p>

              <div className="onboarding-grid-roles" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div 
                  className={`onboarding-role-card ${engine === "local" ? "active" : ""}`}
                  onClick={() => setEngine("local")}
                >
                  <div className="role-accent-dot color-exec"></div>
                  <h3 className="role-title">🏠 Motor Local Offline (SLM)</h3>
                  <p className="role-desc">
                    100% privado y seguro. Los datos no salen de tu máquina. Utiliza la GPU/CPU de tu dispositivo local mediante Llama-server.
                  </p>
                </div>

                <div 
                  className={`onboarding-role-card ${engine === "cloud" ? "active" : ""}`}
                  onClick={() => setEngine("cloud")}
                >
                  <div className="role-accent-dot color-gateway"></div>
                  <h3 className="role-title">☁️ Motor en la Nube (API)</h3>
                  <p className="role-desc">
                    Modelos de alta inteligencia y velocidad a través del gateway (OpenAI GPT-4o, Claude 3.5 Sonnet). Requiere conexión.
                  </p>
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
                      Guardando...
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
