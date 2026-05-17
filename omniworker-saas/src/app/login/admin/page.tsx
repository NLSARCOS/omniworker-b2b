"use client";

import { useState } from "react";

export default function AdminLoginPage() {
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
      if (data.user.role === "SUPERADMIN") {
        window.location.href = "/admin";
      } else {
        // Not an admin
        setError("Acceso denegado: Se requieren permisos de superadministrador.");
        // We probably should log them out so their cookies don't stay as regular user if they didn't intend it, but they are stuck on this page.
        await fetch("/api/v1/auth/logout", { method: "POST" });
      }
    } else {
      setError(data.error || "Error al iniciar sesión");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-white font-mono p-4">
      <div className="max-w-md w-full p-8 border-2 border-red-500/30 bg-zinc-900 shadow-[0_0_40px_rgba(239,68,68,0.15)] relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-orange-600"></div>
        <div className="absolute top-4 right-4 flex space-x-1">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          <div className="w-2 h-2 rounded-full bg-red-900"></div>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tighter mb-2 text-red-500">
          SYSTEM
        </h1>
        <p className="text-sm uppercase tracking-widest mb-8 border-b border-zinc-800 pb-4 text-zinc-400">
          SuperAdmin Authentication
        </p>

        {error && (
          <div className="bg-red-950/50 border border-red-500/50 text-red-200 p-3 mb-6 text-sm font-bold flex items-center">
            <span className="mr-2">⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs uppercase font-bold mb-1.5 text-zinc-400 tracking-wider">
              Identifier
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 p-3 font-mono text-lg focus:outline-none focus:border-red-500 transition-colors text-white placeholder-zinc-700"
              placeholder="root@omniworker.com"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold mb-1.5 text-zinc-400 tracking-wider">
              Passphrase
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 p-3 font-mono text-lg focus:outline-none focus:border-red-500 transition-colors text-white placeholder-zinc-700"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full mt-4 bg-red-600 hover:bg-red-500 text-white p-4 text-xl font-bold uppercase disabled:opacity-50 transition-colors border border-red-500"
          >
            {loading ? "AUTHENTICATING..." : "AUTHORIZE ACCESS"}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-500 uppercase">
          <span>Secured Zone</span>
          <a href="/login" className="hover:text-white transition-colors">
            Return to User Login
          </a>
        </div>
      </div>
    </main>
  );
}
