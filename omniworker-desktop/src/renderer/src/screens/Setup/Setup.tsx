import { useState } from "react";
// import { ArrowRight } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import VerifyWarningBanner from "../../components/VerifyWarningBanner";

interface SetupProps {
  onComplete: () => void;
  verifyWarning?: boolean;
  onReinstall?: () => void;
  onDismissVerifyWarning?: () => void;
}

function Setup({
  onComplete,
  verifyWarning,
  onReinstall,
  onDismissVerifyWarning,
}: SetupProps): React.JSX.Element {
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue(): Promise<void> {
    if (!apiKey.trim() || !apiKey.startsWith("tsto_")) {
      setError("Please enter a valid B2B API Key starting with 'tsto_'");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // Configuramos el agente para que se conecte al Gateway de nuestro SaaS B2B
      const saasUrl = import.meta.env.VITE_SAAS_URL || "http://localhost:3000";
      const gatewayUrl = `${saasUrl}/api/v1`;

      // 1. Validate the API Key against the SaaS backend
      const res = await fetch(`${gatewayUrl}/edge/status`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json"
        }
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError("API Key inválida. Verifica que sea correcta y esté activa.");
        } else {
          setError(`Error validando la llave (${res.status}). Intenta de nuevo.`);
        }
        setSaving(false);
        return;
      }

      // Guardamos la apikey como CUSTOM_API_KEY
      await window.omniworkerAPI.setEnv("CUSTOM_API_KEY", apiKey.trim());

      // Configuramos el provider a "custom" apuntando a nuestro SaaS
      await window.omniworkerAPI.setModelConfig(
        "custom",
        "omniworker", // Modelo por defecto (OmniWorker Normal)
        gatewayUrl,
      );

      onComplete();
    } catch {
      setError(t("setup.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <div className="screen welcome-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)', fontFamily: 'var(--font-mono)' }}>
      {verifyWarning && onReinstall && onDismissVerifyWarning && (
        <VerifyWarningBanner
          onReinstall={onReinstall}
          onDismiss={onDismissVerifyWarning}
        />
      )}
      
      <div style={{ width: '100%', maxWidth: '450px', padding: '32px', backgroundColor: 'var(--bg-primary)', border: '4px solid var(--text-primary)' }}>
        <h1 style={{ fontSize: '36px', fontWeight: '900', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '-1px', color: 'var(--text-primary)' }}>
          OmniWorker B2B
        </h1>
        <p style={{ textTransform: 'uppercase', fontSize: '14px', marginBottom: '32px', borderBottom: '4px solid var(--text-primary)', paddingBottom: '16px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
          Acceso al Agente
        </p>

        {error && (
          <div style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)', padding: '12px', marginBottom: '24px', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-primary)' }}>API Key B2B</label>
            <input
              type="password"
              placeholder="tsto_..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleContinue()}
              autoFocus
              style={{ width: '100%', border: '4px solid var(--text-primary)', padding: '12px', fontSize: '16px', fontFamily: 'var(--font-mono)', backgroundColor: 'transparent', color: 'var(--text-primary)', outline: 'none' }}
            />
            <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Ingresa la API Key (tsto_...) proporcionada en el Dashboard.
            </p>
          </div>

          <button
            onClick={handleContinue}
            disabled={saving || !apiKey.trim()}
            style={{ 
              width: '100%', 
              padding: '16px', 
              backgroundColor: (saving || !apiKey.trim()) ? 'var(--bg-tertiary)' : 'var(--text-primary)', 
              color: (saving || !apiKey.trim()) ? 'var(--text-muted)' : 'var(--bg-primary)', 
              border: '4px solid var(--text-primary)', 
              fontSize: '18px', 
              fontWeight: 'bold', 
              textTransform: 'uppercase', 
              cursor: (saving || !apiKey.trim()) ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {saving ? t("setup.saving") : "Entrar →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Setup;
