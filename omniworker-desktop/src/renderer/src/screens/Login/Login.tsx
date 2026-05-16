import React, { useState } from "react";

interface LoginProps {
  onLoginSuccess: (userData: any, authData: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Usar variable de entorno para producción, fallback a localhost para dev
      const saasUrl = import.meta.env.VITE_SAAS_URL || "http://localhost:3000";
      
      const response = await fetch(`${saasUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error de autenticación");
      }

      // Enviar datos al App.tsx para manejar estado e incializar agente local
      onLoginSuccess(data.user, { accessToken: data.accessToken });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="screen welcome-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="welcome-remote-card" style={{ width: '100%', maxWidth: '400px', padding: '32px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
        
        <h1 className="welcome-title" style={{ fontSize: '24px', marginBottom: '8px', textAlign: 'center' }}>OmniWorker</h1>
        <p className="welcome-subtitle" style={{ marginBottom: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Agent-as-a-Service B2B Login
        </p>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid #ef4444', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="welcome-remote-label" style={{ display: 'block', marginBottom: '8px' }}>Empresa Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="welcome-remote-input"
              placeholder="admin@empresa.com"
              required
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="welcome-remote-label" style={{ display: 'block', marginBottom: '8px' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="welcome-remote-input"
              placeholder="••••••••"
              required
              style={{ width: '100%' }}
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px', padding: '12px' }}
          >
            {isLoading ? "Validando..." : "Ingresar"}
          </button>
        </form>
        
        <p style={{ marginTop: '24px', fontSize: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Uso exclusivo B2B. Contacta a tu administrador para acceso.
        </p>
      </div>
    </div>
  );
}
