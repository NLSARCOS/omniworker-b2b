// src/app/admin/page.tsx — Superadmin Command Center
"use client";

import { useState, useEffect, useMemo } from "react";
import { Terminal, Box, ShieldAlert, Cpu, Activity, Database, DollarSign, Zap } from "lucide-react";

interface Provider {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
  priority: number;
  apiKey: string;
  dailyLimit: number | null;
}

interface ProviderOption {
  id: string;
  label: string;
  baseUrl: string | null;
}

interface OpenCodeGoTierModel {
  id: string;
  label: string;
  weight: number;
  endpoint: string;
}

interface OpenCodeGoTier {
  label: string;
  description: string;
  models: OpenCodeGoTierModel[];
}

type OpenCodeGoTiers = Record<string, OpenCodeGoTier>;

interface Plan {
  id: string;
  name: string;
  tokenLimit: number;
  price: number;
  maxAgents: number;
  maxUsers: number;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  plan: { id: string; name: string; tokenLimit: number; price: number } | null;
  _count: { users: number; edgeAgents: number; tasks: number };
  users: { tokenBalance: number }[];
  createdAt: string;
  subscriptionEndsAt: string | null;
  apiKeys: { id: string; name: string | null; keyPrefix: string; lastUsedAt: string | null }[];
  edgeAgents: { id: string; agentName: string; status: string; lastSeenAt: string | null }[];
}

interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  target: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

type View = "dashboard" | "providers" | "tenants" | "plans" | "audit";

export default function SuperAdminCommandCenter() {
  const [view, setView] = useState<View>("dashboard");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [opencodeGoTiers, setOpencodeGoTiers] = useState<OpenCodeGoTiers>({});
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [modelMetrics, setModelMetrics] = useState<{model: string, calls: number, tokens: number}[]>([]);
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [selectedFormProvider, setSelectedFormProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Total model count across all OpenCode Go tiers
  const opencodeGoModelCount = useMemo(() => {
    const allIds = new Set<string>();
    Object.values(opencodeGoTiers).forEach(tier => {
      tier.models.forEach(m => allIds.add(m.id));
    });
    return allIds.size;
  }, [opencodeGoTiers]);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem("ow_token")}` };
      
      const fetchJson = async (url: string) => {
        const res = await fetch(url, { headers });
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login/admin";
          throw new Error("Unauthorized");
        }
        const text = await res.text();
        if (!text) {
          console.warn(`Empty response from ${url}`);
          return {};
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error(`Invalid JSON from ${url}:`, text);
          return {};
        }
      };

      const [pRes, tRes, plRes, auditRes, metricsRes] = await Promise.all([
        fetchJson("/api/admin/providers"),
        fetchJson("/api/admin/tenants"),
        fetchJson("/api/admin/plans"),
        fetchJson("/api/admin/audit"),
        fetchJson("/api/admin/metrics")
      ]);
      setProviders(pRes.providers || []);
      setProviderOptions(pRes.availableProviders || []);
      setOpencodeGoTiers(pRes.openCodeGoTiers || {});
      setTenants(tRes.tenants || []);
      setPlans(plRes.plans || []);
      setAuditLogs(auditRes.logs || []);
      setModelMetrics(metricsRes.models || []);
    } catch (err) {
      console.error(err);
      setError("SYSTEM_FAULT: Gataway connection failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleProviderCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    await fetch("/api/admin/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
      body: JSON.stringify({
        name: form.nameInput.value,
        provider: form.provider.value,
        apiKey: form.apiKey.value,
        priority: parseInt(form.priority.value),
        dailyLimit: form.dailyLimit.value ? parseInt(form.dailyLimit.value) : null,
        isActive: true
      })
    });
    form.reset();
    loadAll();
  };

  const handleProviderDelete = async (id: string) => {
    if (!confirm("WARN: Destructive action. Confirm?")) return;
    const headers = { Authorization: `Bearer ${localStorage.getItem("ow_token")}` };
    await fetch(`/api/admin/providers?id=${id}`, { method: "DELETE", headers });
    loadAll();
  };

  const handleTenantCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
        body: JSON.stringify({
          name: form.tenantName.value,
          planId: form.planId.value,
          adminEmail: form.adminEmail.value,
          adminPassword: form.adminPassword.value,
          subscriptionEndsAt: form.subscriptionEndsAt.value ? new Date(form.subscriptionEndsAt.value).toISOString() : null,
        })
      });
      
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to create workspace");
        return;
      }
      
      setError("");
      form.reset();
      loadAll();
    } catch (err: any) {
      setError(err.message || "Network error during provisioning");
    }
  };

  const handleTenantUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    const form = e.target as HTMLFormElement;
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
        body: JSON.stringify({
          id: editingTenant.id,
          name: form.tenantName.value,
          planId: form.planId.value || undefined,
          isActive: form.isActive.checked,
          subscriptionEndsAt: form.subscriptionEndsAt.value ? new Date(form.subscriptionEndsAt.value).toISOString() : null,
        })
      });
      
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to update workspace");
        return;
      }
      
      setError("");
      setEditingTenant(null);
      loadAll();
    } catch (err: any) {
      setError(err.message || "Network error during update");
    }
  };

  // --- Business Logic Calculations ---
  // Est. Cost: $0.001 per 1k tokens (blended average assumption for superadmin UI)
  const calcTenantTokensRemaining = (t: Tenant) => {
    return t.users.reduce((acc, u) => acc + u.tokenBalance, 0);
  };
  const calcTenantTokensUsed = (t: Tenant) => {
    const limit = t.plan?.tokenLimit || 0;
    const remaining = calcTenantTokensRemaining(t);
    // Rough estimate if we consider the pool starts at plan limit (this is a simplified proxy)
    const used = Math.max(0, limit - remaining);
    return used;
  };
  const calcTenantEstCost = (t: Tenant) => {
    const used = calcTenantTokensUsed(t);
    return (used / 1000) * 0.001; // $0.001 per 1k tokens
  };

  const totalMRR = tenants.reduce((acc, t) => acc + (t.plan?.price || 0), 0);
  const totalTokensGlobal = tenants.reduce((acc, t) => acc + calcTenantTokensUsed(t), 0);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans antialiased overflow-hidden selection:bg-lime-500 selection:text-black">
      
      {/* SIDEBAR: Command Center Navigation */}
      <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3 text-lime-400 font-bold tracking-widest text-lg">
            <Terminal size={20} className="text-lime-500" />
            <span>OMNIWORKER</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1 font-mono uppercase tracking-widest">Superadmin Root</div>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button onClick={() => setView("dashboard")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "dashboard" ? "bg-zinc-800 text-lime-400" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Activity size={18} /> Business Metrics
          </button>
          <button onClick={() => setView("tenants")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "tenants" ? "bg-zinc-800 text-lime-400" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Box size={18} /> Tenants (Clients)
          </button>
          <button onClick={() => setView("providers")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "providers" ? "bg-zinc-800 text-lime-400" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Cpu size={18} /> LLM Providers
          </button>
          <button onClick={() => setView("plans")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "plans" ? "bg-zinc-800 text-lime-400" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Database size={18} /> Subscriptions
          </button>
          <button onClick={() => setView("audit")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "audit" ? "bg-zinc-800 text-lime-400" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <ShieldAlert size={18} /> Security & Audit
          </button>
        </nav>

        <div className="p-4 border-t border-zinc-800 text-xs font-mono text-zinc-600 flex justify-between">
          <span>SYS_STATUS:</span>
          <span className="text-lime-500">ONLINE</span>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-auto bg-zinc-950 p-8">
        
        {error && (
          <div className="mb-6 border border-red-500/30 bg-red-500/10 text-red-400 p-4 font-mono text-sm flex items-center gap-3">
            <ShieldAlert size={16} /> {error}
          </div>
        )}

        {/* --- VIEW: DASHBOARD (Business Metrics) --- */}
        {view === "dashboard" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <h1 className="text-2xl font-bold text-white tracking-tight uppercase">System Diagnostics & Business</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 p-6">
                <div className="text-zinc-500 text-xs font-mono uppercase mb-2">Total MRR</div>
                <div className="text-3xl font-bold text-white flex items-center gap-2"><DollarSign size={24} className="text-lime-500"/>{totalMRR.toFixed(2)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-6">
                <div className="text-zinc-500 text-xs font-mono uppercase mb-2">Active Tenants</div>
                <div className="text-3xl font-bold text-white">{tenants.filter(t=>t.isActive).length} <span className="text-sm text-zinc-600 font-normal">/ {tenants.length}</span></div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-6">
                <div className="text-zinc-500 text-xs font-mono uppercase mb-2">Global Tokens Used</div>
                <div className="text-3xl font-bold text-white">{(totalTokensGlobal / 1000000).toFixed(2)}M</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-6">
                <div className="text-zinc-500 text-xs font-mono uppercase mb-2">System Edge Agents</div>
                <div className="text-3xl font-bold text-white">{tenants.reduce((acc, t) => acc + t._count.edgeAgents, 0)}</div>
              </div>
            </div>

            <h2 className="text-lg font-bold text-white uppercase mt-12 mb-4 border-b border-zinc-800 pb-2">Business & Platform Insights</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* TOP APIS / MODELS */}
              <div className="bg-zinc-900 border border-zinc-800 p-6">
                <div className="flex items-center gap-3 mb-4 text-zinc-400">
                  <Activity size={18} className="text-lime-500" />
                  <h3 className="font-bold text-white tracking-widest uppercase text-sm">Top Models by Usage</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50">
                      <tr>
                        <th className="px-4 py-3 font-mono">Model / API</th>
                        <th className="px-4 py-3 font-mono">Calls</th>
                        <th className="px-4 py-3 font-mono">Total Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelMetrics.length === 0 && (
                        <tr><td colSpan={3} className="px-4 py-6 text-center text-zinc-500 font-mono">No API usage recorded yet</td></tr>
                      )}
                      {modelMetrics.map((m, i) => (
                        <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                          <td className="px-4 py-3 font-medium text-lime-400">{m.model}</td>
                          <td className="px-4 py-3 text-zinc-300 font-mono">{m.calls.toLocaleString()}</td>
                          <td className="px-4 py-3 text-zinc-300 font-mono">{m.tokens.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TOP CONSUMING TENANTS */}
              <div className="bg-zinc-900 border border-zinc-800 p-6">
                <div className="flex items-center gap-3 mb-4 text-zinc-400">
                  <DollarSign size={18} className="text-lime-500" />
                  <h3 className="font-bold text-white tracking-widest uppercase text-sm">Top Consuming Tenants</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50">
                      <tr>
                        <th className="px-4 py-3 font-mono">Tenant Name</th>
                        <th className="px-4 py-3 font-mono">Tokens Used</th>
                        <th className="px-4 py-3 font-mono">Plan Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.length === 0 && (
                        <tr><td colSpan={3} className="px-4 py-6 text-center text-zinc-500 font-mono">No tenants found</td></tr>
                      )}
                      {[...tenants].sort((a, b) => calcTenantTokensUsed(b) - calcTenantTokensUsed(a)).slice(0, 10).map(t => {
                        const used = calcTenantTokensUsed(t);
                        const isExpired = t.subscriptionEndsAt ? new Date(t.subscriptionEndsAt) < new Date() : false;
                        
                        return (
                          <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                            <td className="px-4 py-3 font-medium text-white">{t.name}</td>
                            <td className="px-4 py-3 font-mono text-zinc-300">{used.toLocaleString()}</td>
                            <td className="px-4 py-3 font-mono text-zinc-400">
                              {t.subscriptionEndsAt ? (
                                <span className={isExpired ? "text-red-400 font-bold" : ""}>
                                  {new Date(t.subscriptionEndsAt).toLocaleDateString()}
                                </span>
                              ) : (
                                "Unlimited"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <h2 className="text-lg font-bold text-white uppercase mt-12 mb-4 border-b border-zinc-800 pb-2">Tenant Consumption Report</h2>
            <div className="bg-zinc-900 border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50">
                    <th className="p-4 font-medium text-zinc-400">TENANT</th>
                    <th className="p-4 font-medium text-zinc-400">PLAN</th>
                    <th className="p-4 font-medium text-zinc-400">LIMIT</th>
                    <th className="p-4 font-medium text-zinc-400">REMAINING</th>
                    <th className="p-4 font-medium text-zinc-400">EST. COST</th>
                    <th className="p-4 font-medium text-zinc-400">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => {
                    const remaining = calcTenantTokensRemaining(t);
                    const cost = calcTenantEstCost(t);
                    const limit = t.plan?.tokenLimit || 0;
                    const percent = limit > 0 ? ((limit - remaining) / limit) * 100 : 0;
                    
                    return (
                    <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="p-4 font-medium text-zinc-200">{t.name}</td>
                      <td className="p-4 text-zinc-400">{t.plan?.name || "None"}</td>
                      <td className="p-4 text-zinc-400 font-mono">{(limit/1000).toFixed(0)}k</td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className={`font-mono ${percent >= 80 ? "text-red-400 font-bold" : "text-lime-400"}`}>{(remaining/1000).toFixed(0)}k</span>
                          <div className="w-24 h-1.5 bg-zinc-800 overflow-hidden">
                            <div className={`h-full ${percent >= 80 ? "bg-red-500 animate-pulse" : "bg-lime-500"}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                          </div>
                          {percent >= 80 && (
                            <span className="flex items-center gap-1 text-[10px] text-red-500 bg-red-500/10 px-1.5 py-0.5 border border-red-500/20 uppercase font-mono tracking-wider ml-1">
                              <ShieldAlert size={10} /> 80%+ Warn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-mono text-zinc-300">${cost.toFixed(4)}</td>
                      <td className="p-4">
                        {t.isActive ? <span className="text-lime-500 text-xs font-mono bg-lime-500/10 px-2 py-1">ACTIVE</span> : <span className="text-red-500 text-xs font-mono bg-red-500/10 px-2 py-1">SUSPENDED</span>}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- VIEW: PROVIDERS --- */}
        {view === "providers" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <h1 className="text-2xl font-bold text-white tracking-tight uppercase">LLM Routing Network</h1>
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Add Node */}
              <div className="bg-zinc-900 border border-zinc-800 p-6 xl:col-span-1 h-fit">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2"><Cpu size={16}/> Register API Node</h2>
                <form onSubmit={handleProviderCreate} className="space-y-5">
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Provider Backbone</label>
                    <select name="provider" onChange={(e) => setSelectedFormProvider(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors">
                      {providerOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>

                  {/* OpenCode Go: Intelligent Routing Banner */}
                  {selectedFormProvider === "opencode-go" && (
                    <div className="border border-lime-500/30 bg-lime-500/5 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-lime-400" />
                        <span className="text-xs font-bold text-lime-400 uppercase tracking-wider">Intelligent Auto-Routing Active</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                        OpenCode Go routes requests across <span className="text-white font-bold">{opencodeGoModelCount} models</span> in 3 tiers 
                        (🧠 Reasoning · ⚖️ Balanced · ⚡ Speed). The system analyzes prompt complexity 
                        and selects the optimal model automatically. No manual model selection needed.
                      </p>
                      <div className="flex gap-2 mt-1">
                        {Object.entries(opencodeGoTiers).map(([key, tier]) => (
                          <span key={key} className="text-[9px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase">
                            {tier.label} ({tier.models.length})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Node Identifier (Name)</label>
                    <input name="nameInput" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors placeholder:text-zinc-700" placeholder={selectedFormProvider === "opencode-go" ? "e.g. OpenCode Go Primary" : "e.g. OpenAI Primary"} />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Secret Key</label>
                    <input name="apiKey" type="password" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors placeholder:text-zinc-700 font-mono text-sm" placeholder="sk-..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Priority (1 = High)</label>
                      <input name="priority" type="number" defaultValue="1" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Daily Cap (Ops)</label>
                      <input name="dailyLimit" type="number" placeholder="∞" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors font-mono" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-lime-500 text-black p-3 font-bold uppercase tracking-wider text-sm hover:bg-lime-400 transition-colors mt-2">
                    Inject Node
                  </button>
                </form>
              </div>

              {/* Node Graph */}
              <div className="xl:col-span-2 space-y-6">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">Active Routing Graph</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {providers.map((p) => {
                    const isOpenCodeGo = p.provider === "opencode-go";
                    return (
                    <div key={p.id} className={`bg-zinc-900 border p-5 group hover:border-zinc-700 transition-colors relative overflow-hidden ${isOpenCodeGo ? "border-lime-500/30" : "border-zinc-800"}`}>
                      <div className="absolute top-0 right-0 p-4">
                        <span className={`w-2 h-2 block rounded-full ${p.isActive ? "bg-lime-500 animate-pulse" : "bg-red-500"}`}></span>
                      </div>
                      <div className="text-lg font-medium text-white mb-1">{p.name}</div>
                      
                      {isOpenCodeGo ? (
                        <div className="mb-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono uppercase bg-lime-500/10 text-lime-400 px-2 py-1 border border-lime-500/30 flex items-center gap-1.5">
                              <Zap size={10} />
                              Intelligent Routing
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500">
                              {opencodeGoModelCount} models · 3 tiers
                            </span>
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {Object.entries(opencodeGoTiers).map(([key, tier]) => {
                              const tierIcons: Record<string, string> = { reasoning: "🧠", balanced: "⚖️", speed: "⚡" };
                              return (
                                <span key={key} className="text-[9px] font-mono px-1.5 py-0.5 bg-zinc-950 text-zinc-500 border border-zinc-800">
                                  {tierIcons[key] || ""} {tier.models.length}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-zinc-500 uppercase bg-zinc-950 inline-block px-2 py-1 mb-4 border border-zinc-800">{p.provider}</div>
                      )}
                      
                      <div className="space-y-2 text-sm font-mono text-zinc-400">
                        <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                          <span>PRIORITY</span><span className="text-zinc-200">Lvl {p.priority}</span>
                        </div>
                        <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                          <span>KEY_HASH</span><span className="text-zinc-200">{p.apiKey}</span>
                        </div>
                        {isOpenCodeGo && (
                          <div className="flex justify-between border-b border-zinc-800/50 pb-1">
                            <span>MODEL_SELECT</span><span className="text-lime-400">AUTO (Complexity-Based)</span>
                          </div>
                        )}
                        <div className="flex justify-between pb-1">
                          <span>LIMIT</span><span className="text-zinc-200">{p.dailyLimit || "UNLIMITED"}</span>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-end">
                        <button onClick={() => handleProviderDelete(p.id)} className="text-xs font-mono text-red-500 hover:text-red-400 uppercase tracking-widest">Terminate</button>
                      </div>
                    </div>
                    );
                  })}
                  {providers.length === 0 && <div className="col-span-2 border border-dashed border-zinc-800 p-12 text-center text-zinc-600 font-mono text-sm uppercase tracking-widest">No routing nodes detected. System offline.</div>}
                </div>

                {/* OpenCode Go Intelligent Routing Matrix */}
                <div className="mt-8">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-2 border-b border-zinc-800 pb-2 flex items-center gap-2">
                    <Activity size={14} className="text-lime-500" />
                    OpenCode Go — Intelligent Auto-Routing
                  </h2>
                  <p className="text-xs text-zinc-500 font-mono mb-5">Requests are automatically classified by complexity and routed to the optimal model tier. Higher weight = higher selection probability within tier.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(opencodeGoTiers).map(([tierKey, tier]) => {
                      const tierColors: Record<string, { border: string; badge: string; bar: string; text: string; icon: string }> = {
                        reasoning: { border: "border-purple-500/40", badge: "bg-purple-500/15 text-purple-400 border-purple-500/30", bar: "bg-purple-500", text: "text-purple-400", icon: "🧠" },
                        balanced:  { border: "border-lime-500/40",   badge: "bg-lime-500/15 text-lime-400 border-lime-500/30",     bar: "bg-lime-500",   text: "text-lime-400",   icon: "⚖️" },
                        speed:     { border: "border-cyan-500/40",   badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",     bar: "bg-cyan-500",   text: "text-cyan-400",   icon: "⚡" },
                      };
                      const colors = tierColors[tierKey] || tierColors.balanced;
                      const maxWeight = Math.max(...tier.models.map(m => m.weight));
                      const totalWeight = tier.models.reduce((sum, m) => sum + m.weight, 0);

                      return (
                        <div key={tierKey} className={`bg-zinc-900 border ${colors.border} p-5 transition-colors hover:bg-zinc-900/80`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{colors.icon}</span>
                            <span className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>{tier.label}</span>
                          </div>
                          <p className="text-[10px] text-zinc-500 font-mono mb-4">{tier.description}</p>
                          
                          <div className="space-y-2.5">
                            {tier.models.map(model => {
                              const pct = Math.round((model.weight / totalWeight) * 100);
                              const isMessages = model.endpoint === "messages";
                              return (
                                <div key={model.id} className="group">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors flex items-center gap-1.5">
                                      {model.label}
                                      {isMessages && <span className="text-[8px] font-mono px-1 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider leading-none">anthropic</span>}
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-500">{pct}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-zinc-800 overflow-hidden">
                                    <div 
                                      className={`h-full ${colors.bar} transition-all duration-500 group-hover:opacity-100 opacity-80`} 
                                      style={{ width: `${(model.weight / maxWeight) * 100}%` }} 
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-4 pt-3 border-t border-zinc-800/50 flex justify-between items-center">
                            <span className="text-[10px] font-mono text-zinc-600 uppercase">{tier.models.length} models</span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 border ${colors.badge} uppercase tracking-wider`}>Auto</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {Object.keys(opencodeGoTiers).length === 0 && (
                    <div className="border border-dashed border-zinc-800 p-8 text-center text-zinc-600 font-mono text-sm uppercase tracking-widest">
                      No routing tiers configured
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* --- VIEW: TENANTS --- */}
        {view === "tenants" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-white tracking-tight uppercase">Tenant Isolation Management</h1>
              <button 
                onClick={() => setShowCreateTenant(!showCreateTenant)} 
                className="bg-lime-500 text-black px-6 py-2 font-bold uppercase tracking-wider text-sm hover:bg-lime-400 transition-colors"
              >
                {showCreateTenant ? "Cancel" : "Provision Workspace"}
              </button>
            </div>
            
            {showCreateTenant && (
              <div className="bg-zinc-900 border border-zinc-800 p-6 animate-in slide-in-from-top-2 duration-300">
                 <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2"><Box size={16}/> Provision New Workspace</h2>
                 <form onSubmit={(e) => { handleTenantCreate(e); setShowCreateTenant(false); }} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Organization Name *</label>
                     <input name="tenantName" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors placeholder:text-zinc-800/50" placeholder="Type name here..." />
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Subscription Protocol</label>
                     <select name="planId" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors">
                       <option value="">[UNASSIGNED]</option>
                       {plans.map(p => <option key={p.id} value={p.id}>{p.name} - ${(p.price).toFixed(2)}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Plan Expiry Date</label>
                     <input name="subscriptionEndsAt" type="date" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors [&::-webkit-calendar-picker-indicator]:invert-[0.8]" />
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Root Email *</label>
                     <input name="adminEmail" type="email" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors placeholder:text-zinc-800/50" placeholder="Type email..." />
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Initial Keyphrase *</label>
                     <input name="adminPassword" type="password" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors placeholder:text-zinc-800/50" placeholder="Type password..." />
                   </div>
                   <div className="md:col-span-3 lg:col-span-5 flex justify-end">
                     <button type="submit" className="bg-lime-500 text-black px-8 py-3 font-bold uppercase tracking-wider text-sm hover:bg-lime-400 transition-colors">
                       Execute Provisioning
                     </button>
                   </div>
                 </form>
              </div>
            )}

            {/* List Table */}
            <div className="bg-zinc-900 border border-zinc-800 overflow-x-auto">
              <table className="w-full text-left font-mono text-sm text-zinc-300">
                <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Tenant Name</th>
                    <th className="px-6 py-4">ID (Slug)</th>
                    <th className="px-6 py-4">Plan</th>
                    <th className="px-6 py-4 text-center">Users</th>
                    <th className="px-6 py-4 text-center">Agents</th>
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {t.isActive ? <span className="w-2 h-2 inline-block bg-lime-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(132,204,22,0.8)]"></span> : <span className="w-2 h-2 inline-block bg-red-500 rounded-full"></span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-white">{t.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-zinc-500">{t.slug}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{t.plan?.name || "NONE"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">{t._count.users}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">{t._count.edgeAgents}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-zinc-500">{new Date(t.createdAt).toISOString().split('T')[0]}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right space-x-4">
                        <button 
                          onClick={() => setExpandedTenantId(expandedTenantId === t.id ? null : t.id)}
                          className="text-xs font-mono text-zinc-400 hover:text-white uppercase tracking-widest transition-colors"
                        >
                          {expandedTenantId === t.id ? "Hide Details" : "Details"}
                        </button>
                        <button 
                          onClick={() => setEditingTenant(t)}
                          className="text-xs font-mono text-lime-500 hover:text-lime-400 uppercase tracking-widest transition-colors"
                        >
                          Modify
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-zinc-600">No tenants found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* EDITING MODAL */}
            {editingTenant && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 w-full max-w-2xl animate-in zoom-in-95 duration-200">
                  <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-6 border-b border-zinc-800 pb-2">Modify Workspace: {editingTenant.name}</h2>
                  <form onSubmit={handleTenantUpdateSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Organization Name</label>
                        <input name="tenantName" defaultValue={editingTenant.name} required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Subscription Protocol</label>
                        <select name="planId" defaultValue={editingTenant.plan?.id || ""} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors">
                          <option value="">[UNASSIGNED]</option>
                          {plans.map(p => <option key={p.id} value={p.id}>{p.name} - ${(p.price).toFixed(2)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Plan Expiry Date</label>
                        <input name="subscriptionEndsAt" type="date" defaultValue={editingTenant.subscriptionEndsAt ? new Date(editingTenant.subscriptionEndsAt).toISOString().split('T')[0] : ""} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-lime-500 transition-colors [&::-webkit-calendar-picker-indicator]:invert-[0.8]" />
                      </div>
                      <div className="flex items-end pb-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" name="isActive" defaultChecked={editingTenant.isActive} className="w-5 h-5 accent-lime-500 bg-zinc-950 border border-zinc-800" />
                          <span className="text-sm font-mono text-zinc-300 uppercase tracking-widest">Active Workspace</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-4 mt-8 pt-4 border-t border-zinc-800">
                      <button type="button" onClick={() => setEditingTenant(null)} className="text-zinc-400 hover:text-white uppercase text-xs font-bold tracking-widest px-4 py-2">
                        Cancel
                      </button>
                      <button type="submit" className="bg-lime-500 text-black px-6 py-2 font-bold uppercase tracking-wider text-sm hover:bg-lime-400 transition-colors">
                        Save Changes
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* EXPANDED DETAILS */}
            {expandedTenantId && (
              <div className="bg-zinc-900 border border-zinc-800 p-6 animate-in slide-in-from-top-4 duration-300">
                {(() => {
                  const t = tenants.find(t => t.id === expandedTenantId);
                  if (!t) return null;
                  return (
                    <div>
                      <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
                        <h2 className="text-lg font-bold text-white uppercase">Devices & Keys: {t.name}</h2>
                        <button onClick={() => setExpandedTenantId(null)} className="text-zinc-400 hover:text-white">✕</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">API Keys ({t.apiKeys?.length || 0})</h3>
                          {t.apiKeys?.length === 0 ? (
                            <div className="text-zinc-600 text-xs font-mono italic p-4 border border-dashed border-zinc-800">No API keys registered.</div>
                          ) : (
                            <div className="space-y-2">
                              {t.apiKeys?.map(k => (
                                <div key={k.id} className="bg-zinc-950 border border-zinc-800 p-3 flex justify-between items-center text-xs font-mono">
                                  <div className="text-zinc-300">{k.name || "Unnamed"} <span className="text-zinc-600 ml-2">{k.keyPrefix}...</span></div>
                                  <div className="text-zinc-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Edge Agents ({t.edgeAgents?.length || 0})</h3>
                          {t.edgeAgents?.length === 0 ? (
                            <div className="text-zinc-600 text-xs font-mono italic p-4 border border-dashed border-zinc-800">No active edge agents.</div>
                          ) : (
                            <div className="space-y-2">
                              {t.edgeAgents?.map(a => (
                                <div key={a.id} className="bg-zinc-950 border border-zinc-800 p-3 flex justify-between items-center text-xs font-mono">
                                  <div className="text-zinc-300">{a.agentName}</div>
                                  <div>
                                    {a.status === "online" ? <span className="text-lime-500">ONLINE</span> : <span className="text-zinc-500">OFFLINE</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* --- VIEW: PLANS --- */}
        {view === "plans" && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <h1 className="text-2xl font-bold text-white tracking-tight uppercase">Subscription Protocols</h1>
             <p className="text-zinc-500 font-mono text-sm">Define capabilities and token constraints for tenant workspaces.</p>
          </div>
        )}

        {/* --- VIEW: SECURITY --- */}
        {view === "audit" && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <h1 className="text-2xl font-bold text-white tracking-tight uppercase flex items-center gap-3">
               <ShieldAlert size={28} className="text-lime-500" />
               Security & Audit Log
             </h1>
             <div className="bg-zinc-900 border-l-4 border-lime-500 p-6">
                <div className="text-lime-400 font-mono font-bold mb-2">IMMUTABLE LEDGER ACTIVE</div>
                <p className="text-zinc-400 text-sm">All SuperAdmin destructive actions (DELETE, UPDATE, PROVISION) are hard-logged into the PostgreSQL audit chain associated with your admin token. Actions cannot be repudiated.</p>
             </div>
             <div className="bg-zinc-900 border border-zinc-800 overflow-x-auto">
               <table className="w-full text-left font-mono text-sm text-zinc-300">
                 <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase">
                   <tr>
                     <th className="px-6 py-4">Timestamp</th>
                     <th className="px-6 py-4">Admin ID</th>
                     <th className="px-6 py-4">Action</th>
                     <th className="px-6 py-4">Target</th>
                     <th className="px-6 py-4">Details</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800">
                   {auditLogs.map(log => (
                     <tr key={log.id} className="hover:bg-zinc-800/50 transition-colors">
                       <td className="px-6 py-4 whitespace-nowrap text-zinc-500">{new Date(log.createdAt).toLocaleString()}</td>
                       <td className="px-6 py-4 whitespace-nowrap">{log.adminId.slice(0, 8)}...</td>
                       <td className="px-6 py-4 whitespace-nowrap font-bold text-lime-400">{log.action}</td>
                       <td className="px-6 py-4 whitespace-nowrap">{log.target || "-"}</td>
                       <td className="px-6 py-4 truncate max-w-xs">{log.details || "-"}</td>
                     </tr>
                   ))}
                   {auditLogs.length === 0 && (
                     <tr>
                       <td colSpan={5} className="px-6 py-8 text-center text-zinc-600">No audit logs found.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}
