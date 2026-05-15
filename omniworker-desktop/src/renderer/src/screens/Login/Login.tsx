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
      onLoginSuccess(data.user, data.auth);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-white text-black font-mono">
      <div className="w-full max-w-md border-[12px] border-black p-8 bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
        <h1 className="text-4xl font-bold uppercase mb-2 border-b-4 border-black pb-2">OmniWorker</h1>
        <p className="text-sm font-bold uppercase mb-8">Agent-as-a-Service B2B Login</p>

        {error && (
          <div className="bg-black text-white p-3 mb-6 font-bold uppercase text-sm border-2 border-black">
            Error: {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xl font-bold uppercase mb-2">Empresa Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-4 border-black p-3 outline-none focus:bg-gray-100 font-bold"
              placeholder="admin@empresa.com"
              required
            />
          </div>
          <div>
            <label className="block text-xl font-bold uppercase mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-4 border-black p-3 outline-none focus:bg-gray-100 font-bold"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white font-bold uppercase text-xl py-4 hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Validando..." : "Ingresar"}
          </button>
        </form>
        
        <p className="mt-6 text-xs font-bold text-center uppercase text-gray-500">
          Uso exclusivo B2B. Contacta a tu administrador para acceso.
        </p>
      </div>
    </div>
  );
}
