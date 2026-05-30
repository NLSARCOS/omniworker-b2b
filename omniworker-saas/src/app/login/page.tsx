// src/app/login/page.tsx — Página de login
"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.success) {
      if (data.accessToken) {
        localStorage.setItem("ow_token", data.accessToken);
      }
      window.location.href = "/dashboard";
    } else {
      setError(data.error || "Error al iniciar sesión");
    }
  };

  return (
    <main style={{ 
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", 
      background: "var(--paper)", color: "var(--ink)", padding: 24,
      backgroundImage: "repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(0,0,0,0.018) 23px, rgba(0,0,0,0.018) 24px)",
    }}>
      <div style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: 32 }}>
            <img src="/logo.svg" alt="Flux Agent" style={{ height: 36, display: "block", margin: "0 auto" }} />
          </Link>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 80, "SOFT" 30', fontSize: 40, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.05, margin: "0 0 12px", color: "var(--ink)" }}>
            Iniciar sesión
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
            Accede al panel de control de tu asistente.
          </p>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#FEF2F2", border: `1.5px solid var(--danger)`, marginBottom: 24, borderRadius: 8, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--danger)", margin: 0, fontWeight: 500 }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ background: "var(--paper)", padding: 32, borderRadius: 12, border: "1.5px solid var(--rule)", boxShadow: "0 8px 32px rgba(0,0,0,0.04)" }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "12px 16px", border: "1.5px solid var(--rule)", borderRadius: 8, fontSize: 15, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", background: "var(--paper-warm)", color: "var(--ink)", outline: "none", transition: "border-color 0.2s" }}
              placeholder="tu@empresa.com"
              onFocus={(e) => e.target.style.borderColor = "var(--ink)"}
              onBlur={(e) => e.target.style.borderColor = "var(--rule)"}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "12px 16px", border: "1.5px solid var(--rule)", borderRadius: 8, fontSize: 15, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", background: "var(--paper-warm)", color: "var(--ink)", outline: "none", transition: "border-color 0.2s" }}
              placeholder="••••••••"
              onFocus={(e) => e.target.style.borderColor = "var(--ink)"}
              onBlur={(e) => e.target.style.borderColor = "var(--rule)"}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "12px 24px", fontSize: 15, fontWeight: 600,
              background: "var(--ink)", color: "var(--paper)", border: "1.5px solid var(--ink)", borderRadius: 8,
              cursor: (loading || !email || !password) ? "not-allowed" : "pointer", fontFamily: "'Inter', sans-serif",
              opacity: (loading || !email || !password) ? 0.7 : 1, transition: "opacity 0.2s"
            }}
          >
            {loading ? "Entrando..." : "Entrar al panel"}
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 14, textAlign: "center", color: "var(--muted)", fontFamily: "'Inter', sans-serif" }}>
          ¿No tienes cuenta?{" "}
          <Link href="/register" style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 4 }}>
            Regístrate aquí
          </Link>
        </p>
      </div>
    </main>
  );
}
