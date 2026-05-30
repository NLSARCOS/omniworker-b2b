// src/app/register/page.tsx — Página de registro público
"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, tenantName }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.success) {
      setSuccess(true);
      setTimeout(() => (window.location.href = "/dashboard"), 1500);
    } else {
      setError(data.error || "Error al registrar");
    }
  };

  if (success) {
    return (
      <main style={{ 
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", 
        background: "var(--paper)", color: "var(--ink)", padding: 24,
      }}>
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 64, color: "var(--neon)", marginBottom: 16 }}>✓</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontVariationSettings: '"opsz" 80, "SOFT" 30', fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 12px" }}>¡Registrado!</h1>
          <p style={{ fontSize: 15, color: "var(--muted)", fontFamily: "'Inter', sans-serif" }}>Redirigiendo al panel de control...</p>
        </div>
      </main>
    );
  }

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
            Registro
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
            Crea tu cuenta de Flux Agent.
          </p>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#FEF2F2", border: `1.5px solid var(--danger)`, marginBottom: 24, borderRadius: 8, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--danger)", margin: 0, fontWeight: 500 }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleRegister} style={{ background: "var(--paper)", padding: 32, borderRadius: 12, border: "1.5px solid var(--rule)", boxShadow: "0 8px 32px rgba(0,0,0,0.04)" }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>
              Nombre completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", padding: "12px 16px", border: "1.5px solid var(--rule)", borderRadius: 8, fontSize: 15, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", background: "var(--paper-warm)", color: "var(--ink)", outline: "none", transition: "border-color 0.2s" }}
              placeholder="Ej. Ana García"
              onFocus={(e) => e.target.style.borderColor = "var(--ink)"}
              onBlur={(e) => e.target.style.borderColor = "var(--rule)"}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>
              Correo electrónico *
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

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>
              Contraseña *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{ width: "100%", padding: "12px 16px", border: "1.5px solid var(--rule)", borderRadius: 8, fontSize: 15, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", background: "var(--paper-warm)", color: "var(--ink)", outline: "none", transition: "border-color 0.2s" }}
              placeholder="•••••••• (mín. 8 caracteres)"
              onFocus={(e) => e.target.style.borderColor = "var(--ink)"}
              onBlur={(e) => e.target.style.borderColor = "var(--rule)"}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Inter', sans-serif", color: "var(--muted)" }}>
              Empresa (opcional)
            </label>
            <input
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              style={{ width: "100%", padding: "12px 16px", border: "1.5px solid var(--rule)", borderRadius: 8, fontSize: 15, fontFamily: "'Inter', sans-serif", boxSizing: "border-box", background: "var(--paper-warm)", color: "var(--ink)", outline: "none", transition: "border-color 0.2s" }}
              placeholder="Ej. Acme Corp"
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
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 14, textAlign: "center", color: "var(--muted)", fontFamily: "'Inter', sans-serif" }}>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 4 }}>
            Inicia sesión aquí
          </Link>
        </p>
      </div>
    </main>
  );
}
