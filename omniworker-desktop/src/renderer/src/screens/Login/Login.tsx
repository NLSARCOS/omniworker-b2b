import React, { useState, useEffect, useRef } from "react";

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

async function loginRequest(email: string, password: string): Promise<{ user: any; accessToken: string; refreshToken?: string }> {
  const saasUrl = "https://worker.thelab.lat";
  const url = `${saasUrl}/api/v1/auth/login`;
  const opts: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = await loginRequest(email, password);
      onLoginSuccess(data.user, {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    } catch (err: any) {
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
        background: "var(--bg-primary, #0d0d0d)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "36px 32px",
          backgroundColor: "var(--bg-secondary, #1a1a1a)",
          border: "1px solid var(--border, #2a2a2a)",
          borderRadius: "14px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
        }}
      >
        {/* Logo / Brand */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #4f8ef7, #a855f7)",
              margin: "0 auto 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: -1,
            }}
          >
            OW
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--text-primary, #fff)" }}>
            OmniWorker
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted, #666)" }}>
            Agent-as-a-Service · B2B
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              color: "#f87171",
              border: "1px solid rgba(239,68,68,0.35)",
              padding: "11px 14px",
              borderRadius: "8px",
              marginBottom: "18px",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: 13, color: "var(--text-muted, #888)" }}>
              Email corporativo
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@empresa.com"
              required
              disabled={isLoading}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg-tertiary, #111)",
                border: "1px solid var(--border, #2a2a2a)",
                borderRadius: "8px",
                color: "var(--text-primary, #fff)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: 13, color: "var(--text-muted, #888)" }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isLoading}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg-tertiary, #111)",
                border: "1px solid var(--border, #2a2a2a)",
                borderRadius: "8px",
                color: "var(--text-primary, #fff)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: "6px",
              padding: "12px",
              width: "100%",
              background: isLoading
                ? "linear-gradient(135deg, #3b6fd4, #8b44d4)"
                : "linear-gradient(135deg, #4f8ef7, #a855f7)",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.85 : 1,
              transition: "opacity 0.2s, transform 0.1s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
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
                    borderTopColor: "#fff",
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

        <p style={{ marginTop: "22px", fontSize: "12px", textAlign: "center", color: "var(--text-muted, #555)" }}>
          Acceso exclusivo B2B · Contacta a tu administrador
        </p>
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
