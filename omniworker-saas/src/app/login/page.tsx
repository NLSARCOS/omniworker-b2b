// src/app/login/page.tsx — Página de login
"use client";

import { useState } from "react";

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
      localStorage.setItem("ow_token", data.auth.accessToken);
      localStorage.setItem("ow_user", JSON.stringify(data.user));
      window.location.href = "/dashboard";
    } else {
      setError(data.error || "Error al iniciar sesión");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center border-[16px] border-black m-4 bg-white text-black font-mono">
      <div className="max-w-md w-full p-8">
        <h1 className="text-5xl sm:text-6xl font-bold uppercase tracking-tighter mb-2">
          Login
        </h1>
        <p className="text-sm uppercase mb-8 border-b-4 border-black pb-4">
          Accede a OmniWorker
        </p>

        {error && (
          <div className="bg-black text-white p-3 mb-4 text-sm font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs uppercase font-bold mb-1">
              Email
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
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border-4 border-black p-3 font-mono text-lg focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-black text-white p-4 text-xl font-bold uppercase border-4 border-black hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Entrando..." : "Entrar →"}
          </button>
        </form>

        <p className="mt-6 text-sm text-center">
          ¿No tienes cuenta?{" "}
          <a href="/register" className="underline font-bold">
            Regístrate
          </a>
        </p>
      </div>
    </main>
  );
}
