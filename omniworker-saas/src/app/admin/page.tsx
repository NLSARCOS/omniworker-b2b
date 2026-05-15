"use client";

import { useState, useEffect } from "react";

export default function SuperAdminPage() {
  const [openAiKey, setOpenAiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // En un MVP real haríamos un useEffect para traer los existentes
  
  const handleSave = async (provider: string, apiKey: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, isActive: true })
      });
      if (res.ok) {
        alert("¡Llave guardada en la base de datos!");
      } else {
        alert("Error al guardar la llave");
      }
    } catch (e) {
      alert("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 sm:p-20 font-mono flex flex-col items-center bg-white text-black">
      <div className="max-w-4xl w-full border-[16px] border-black p-8">
        <h1 className="text-4xl sm:text-6xl font-bold uppercase tracking-tighter mb-8 border-b-8 border-black pb-4">
          Superadmin
        </h1>

        <div className="mb-12">
          <h2 className="text-2xl font-bold uppercase bg-black text-white p-2 inline-block mb-6">
            Master Providers
          </h2>
          
          <div className="space-y-6">
            {/* OpenAI Card */}
            <div className="card-brutal flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold uppercase">OpenAI (GPT-4o)</h3>
                <p className="text-sm">Ruta principal de razonamiento</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input 
                  type="password" 
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  className="input-brutal flex-grow" 
                  placeholder="sk-proj-..."
                />
                <button 
                  onClick={() => handleSave("openai", openAiKey)}
                  disabled={isLoading || !openAiKey}
                  className="btn-brutal bg-black text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>

            {/* Anthropic Card */}
            <div className="card-brutal flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold uppercase">Anthropic (Claude 3.5)</h3>
                <p className="text-sm">Ruta secundaria</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input 
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  className="input-brutal flex-grow" 
                  placeholder="sk-ant-..."
                />
                <button 
                  onClick={() => handleSave("anthropic", anthropicKey)}
                  disabled={isLoading || !anthropicKey}
                  className="btn-brutal disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>

            {/* DeepSeek Card */}
            <div className="card-brutal flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold uppercase">DeepSeek</h3>
                <p className="text-sm">Modelos eficientes de código</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input 
                  type="password"
                  id="deepseek-key"
                  className="input-brutal flex-grow" 
                  placeholder="sk-..."
                />
                <button 
                  onClick={() => handleSave("deepseek", (document.getElementById('deepseek-key') as HTMLInputElement).value)}
                  className="btn-brutal disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>

            {/* Kimi (Moonshot) Card */}
            <div className="card-brutal flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold uppercase">Kimi (Moonshot)</h3>
                <p className="text-sm">Modelos de contexto largo</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input 
                  type="password"
                  id="kimi-key"
                  className="input-brutal flex-grow" 
                  placeholder="sk-..."
                />
                <button 
                  onClick={() => handleSave("moonshot", (document.getElementById('kimi-key') as HTMLInputElement).value)}
                  className="btn-brutal disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>

            {/* MiniMax Card */}
            <div className="card-brutal flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold uppercase">MiniMax</h3>
                <p className="text-sm">Modelos alternativos</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input 
                  type="password"
                  id="minimax-key"
                  className="input-brutal flex-grow" 
                  placeholder="sk-..."
                />
                <button 
                  onClick={() => handleSave("minimax", (document.getElementById('minimax-key') as HTMLInputElement).value)}
                  className="btn-brutal disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>

            {/* OpenCode Go Card */}
            <div className="card-brutal flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-xl font-bold uppercase">OpenCode Go</h3>
                <p className="text-sm">Provider de modelos curados para código</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input 
                  type="password"
                  id="opencode-key"
                  className="input-brutal flex-grow" 
                  placeholder="sk-opencode-..."
                />
                <button 
                  onClick={() => handleSave("opencode-go", (document.getElementById('opencode-key') as HTMLInputElement).value)}
                  className="btn-brutal disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>

          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold uppercase bg-black text-white p-2 inline-block mb-6">
            Gestión B2B (Usuarios / Empresas)
          </h2>
          
          <table className="w-full border-collapse border-4 border-black">
            <thead>
              <tr className="bg-black text-white">
                <th className="p-3 text-left uppercase border-r-4 border-white">Empresa / Email</th>
                <th className="p-3 text-left uppercase border-r-4 border-white">Plan</th>
                <th className="p-3 text-left uppercase">Token Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b-4 border-black font-bold">
                <td className="p-3 border-r-4 border-black">acme@corp.com</td>
                <td className="p-3 border-r-4 border-black">PRO</td>
                <td className="p-3 text-right">15,000</td>
              </tr>
            </tbody>
          </table>
        </div>
        
      </div>
    </main>
  );
}
