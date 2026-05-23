import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";

interface LoginProps {
  onLoginSuccess: (userData: any, authData: any) => void;
}

const STATUS_MESSAGES = [
  "Conectando al servidor...",
  "Verificando credenciales...",
  "Iniciando sesión...",
];

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, opts: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loginRequest(
  email: string,
  password: string,
  deviceFingerprint?: string,
  deviceName?: string,
): Promise<{ user: any; accessToken: string; refreshToken?: string }> {
  const saasUrl = "https://worker.thelab.lat";
  const url = `${saasUrl}/api/v1/auth/login`;
  const opts: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, deviceFingerprint, deviceName }),
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(url, opts);
  } catch (firstErr: any) {
    // Auto-retry once — handles VPS cold starts / brief network hiccups
    console.error("[LOGIN] First attempt failed, retrying...", firstErr.message);
    await new Promise((r) => setTimeout(r, 1200));
    response = await fetchWithTimeout(url, opts);
  }

  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error || data?.message || "Error de autenticación";
    throw new Error(msg);
  }
  return data;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Cycle through status messages while loading
  useEffect(() => {
    if (isLoading) {
      setStatusIdx(0);
      intervalRef.current = setInterval(() => {
        setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length);
      }, 1800);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoading]);

  // Premium GSAP entrance animation for the login card
  useEffect(() => {
    gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 50, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 1.4, ease: "power4.out", delay: 0.15 }
    );
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let fingerprint: string | undefined;
      let deviceName: string | undefined;
      try {
        fingerprint = await window.omniworkerAPI.getDeviceFingerprint();
        deviceName = await window.omniworkerAPI.getDeviceName();
      } catch (fpErr) {
        console.error("[Login] Failed to retrieve device fingerprint/name:", fpErr);
      }
      const data = await loginRequest(email, password, fingerprint, deviceName);
      await onLoginSuccess(data.user, {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    } catch (err: any) {
      console.error("[Login] Error:", err);
      const isTimeout = err.name === "AbortError" || err.message?.includes("abort");
      setError(
        isTimeout
          ? "El servidor tardó demasiado. Reintentando automáticamente... Si persiste, verifica tu conexión."
          : err.message || "No se pudo conectar al servidor.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        background: "radial-gradient(circle at center, var(--bg-primary) 0%, var(--bg-secondary) 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background soft ambient radial lights */}
      <div
        style={{
          position: "absolute",
          width: "450px",
          height: "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--accent-subtle) 0%, transparent 70%)",
          top: "10%",
          left: "10%",
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "550px",
          height: "550px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(221, 183, 255, 0.04) 0%, transparent 70%)",
          bottom: "10%",
          right: "10%",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div
        ref={cardRef}
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "40px 36px",
          background: "rgba(31, 31, 34, 0.45)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--glass-shadow)",
          fontFamily: "var(--font-sans)",
          zIndex: 10,
        }}
      >
        {/* Logo / Brand */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 15px var(--accent-subtle)",
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 900,
              color: "var(--accent-btn-text)",
              letterSpacing: "-0.5px",
              fontFamily: "var(--font-mono)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            OW
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 800,
              margin: 0,
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
              letterSpacing: "-0.5px",
            }}
          >
            OmniWorker
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "12px",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "1px",
            }}
          >
            AGENT-AS-A-SERVICE · B2B
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: "var(--error-bg)",
              color: "var(--error)",
              border: "1px solid var(--error)",
              padding: "11px 14px",
              borderRadius: "var(--radius-sm)",
              marginBottom: "18px",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "13px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
              }}
            >
              Email corporativo
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@empresa.com"
              required
              disabled={isLoading}
              className="input"
              style={{
                background: "var(--bg-primary)",
                fontFamily: "var(--font-sans)",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "13px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
              }}
            >
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isLoading}
              className="input"
              style={{
                background: "var(--bg-primary)",
                fontFamily: "var(--font-sans)",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{
              marginTop: "12px",
              padding: "14px 24px",
              width: "100%",
              fontSize: "15px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              fontFamily: "var(--font-sans)",
              borderRadius: "var(--radius-md)",
            }}
          >
            {isLoading ? (
              <>
                {/* Pulsing spinner */}
                <span
                  style={{
                    display: "inline-block",
                    width: 16,
                    height: 16,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "var(--accent-btn-text)",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                <span>{STATUS_MESSAGES[statusIdx]}</span>
              </>
            ) : (
              "Ingresar"
            )}
          </button>
        </form>

        <p
          style={{
            marginTop: "24px",
            fontSize: "12px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.5px",
          }}
        >
          Acceso exclusivo B2B · Contacta a tu administrador
        </p>
      </div>

      {/* Decorative fine-line border stitch */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          right: "20px",
          bottom: "20px",
          border: "1px dashed rgba(255, 255, 255, 0.03)",
          pointerEvents: "none",
          borderRadius: "16px",
        }}
      />

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
