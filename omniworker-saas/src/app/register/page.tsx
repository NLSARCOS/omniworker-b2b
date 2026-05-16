// src/app/register/page.tsx — Página de registro público
"use client";

import { useState } from "react";

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
      <main className="min-h-screen flex items-center justify-center border-[16px] border-black m-4 bg-white text-black font-mono">
        <div className="max-w-md w-full text-center p-8">
          <div className="text-6xl mb-4">✓</div>
          <h1 className="text-3xl font-bold uppercase mb-2">¡Registrado!</h1>
          <p className="text-lg">Redirigiendo al dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center border-[16px] border-black m-4 bg-white text-black font-mono">
      <div className="max-w-md w-full p-8">
        <h1 className="text-5xl sm:text-6xl font-bold uppercase tracking-tighter mb-2">
          Registro
        </h1>
        <p className="text-sm uppercase mb-8 border-b-4 border-black pb-4">
          Crea tu cuenta OmniWorker
        </p>

        {error && (
          <div className="bg-black text-white p-3 mb-4 text-sm font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs uppercase font-bold mb-1">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-4 border-black p-3 font-mono text-lg focus:outline-none focus:ring-0"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border-4 border-black p-3 font-mono text-lg focus:outline-none"
              placeholder="tu@empresa.com"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold mb-1">
              Contraseña * (min. 8 caracteres)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border-4 border-black p-3 font-mono text-lg focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold mb-1">
              Nombre de la empresa (opcional)
            </label>
            <input
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full border-4 border-black p-3 font-mono text-lg focus:outline-none"
              placeholder="Acme Corp"
            />
            <p className="text-xs mt-1 opacity-60">
              Si provides un nombre, se creará un workspace para tu equipo.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-black text-white p-4 text-xl font-bold uppercase border-4 border-black hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creando cuenta..." : "Crear cuenta →"}
          </button>
        </form>

        <p className="mt-6 text-sm text-center">
          ¿Ya tienes cuenta?{" "}
          <a href="/login" className="underline font-bold">
            Inicia sesión
          </a>
        </p>
      </div>
    </main>
  );
}
