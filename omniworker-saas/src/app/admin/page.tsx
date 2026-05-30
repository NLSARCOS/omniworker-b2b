// src/app/admin/page.tsx — Superadmin Command Center
"use client";

import { useState, useEffect, useMemo } from "react";
import { Terminal, Box, ShieldAlert, Cpu, Activity, Database, DollarSign, Zap, Download, FlaskConical, CheckCircle2, XCircle, Loader2 } from "lucide-react";

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
  description: string | null;
  tokenLimit: number;
  price: number;
  maxAgents: number;
  maxUsers: number;
  maxLicenses: number;
  billingPeriod: string;
  isActive: boolean;
  isPublic: boolean;
  features: string;
  sortOrder: number;
  _count?: { tenants: number };
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  plan: { id: string; name: string; tokenLimit: number; price: number; maxLicenses?: number } | null;
  _count: { users: number; edgeAgents: number; tasks: number; licenses?: number };
  users: { tokenBalance: number }[];
  createdAt: string;
  subscriptionEndsAt: string | null;
  apiKeys: { id: string; name: string | null; keyPrefix: string; lastUsedAt: string | null }[];
  edgeAgents: { id: string; agentName: string; status: string; lastSeenAt: string | null }[];
  licenses?: { id: string; name: string; status: string; deviceFingerprint: string | null; lastSeenAt: string | null; tokenBalance?: number; createdAt: string }[];
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

interface AppUpdate {
  id: string;
  version: string;
  urlWindows: string;
  urlMac: string;
  urlLinux: string;
  releaseNotes: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  paymentMethod: string;
  paidAt: string;
  createdAt: string;
  tenant?: { id: string; name: string };
}

type View = "dashboard" | "providers" | "tenants" | "plans" | "audit" | "updates";

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
  const [paymentTenant, setPaymentTenant] = useState<Tenant | null>(null);
  const [defaultExpiryDate, setDefaultExpiryDate] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [viewingInvoicesTenant, setViewingInvoicesTenant] = useState<Tenant | null>(null);
  const [tenantInvoices, setTenantInvoices] = useState<Invoice[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [selectedFormProvider, setSelectedFormProvider] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { status: "testing" | "success" | "error"; latencyMs?: number; model?: string; response?: string; error?: string }>>({});

  const [error, setError] = useState("");
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [showCreateUpdate, setShowCreateUpdate] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  // Total model count across all OpenCode Go tiers
  const opencodeGoModelCount = useMemo(() => {
    const allIds = new Set<string>();
    Object.values(opencodeGoTiers).forEach(tier => {
      tier.models.forEach(m => allIds.add(m.id));
    });
    return allIds.size;
  }, [opencodeGoTiers]);

  const loadAll = async () => {
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
        } catch {
          console.error(`Invalid JSON from ${url}:`, text);
          return {};
        }
      };

      const [pRes, tRes, plRes, auditRes, metricsRes, upRes] = await Promise.all([
        fetchJson("/api/admin/providers"),
        fetchJson("/api/admin/tenants"),
        fetchJson("/api/admin/plans"),
        fetchJson("/api/admin/audit"),
        fetchJson("/api/admin/metrics"),
        fetchJson("/api/admin/updates")
      ]);
      setProviders(pRes.providers || []);
      setProviderOptions(pRes.availableProviders || []);
      setOpencodeGoTiers(pRes.openCodeGoTiers || {});
      setTenants(tRes.tenants || []);
      setPlans(plRes.plans || []);
      setAuditLogs(auditRes.logs || []);
      setModelMetrics(metricsRes.models || []);
      setUpdates(upRes.updates || []);
    } catch (err) {
      console.error(err);
      setError("SYSTEM_FAULT: Gataway connection failed.");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  const handleUpdateCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const version = (form.elements.namedItem("version") as HTMLInputElement).value;
    const urlWindows = (form.elements.namedItem("urlWindows") as HTMLInputElement).value;
    const urlMac = (form.elements.namedItem("urlMac") as HTMLInputElement).value;
    const urlLinux = (form.elements.namedItem("urlLinux") as HTMLInputElement).value;
    const releaseNotes = (form.elements.namedItem("releaseNotes") as HTMLTextAreaElement).value;
    const isActive = (form.elements.namedItem("isActive") as HTMLInputElement).checked;

    try {
      const res = await fetch("/api/admin/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
        body: JSON.stringify({ version, urlWindows, urlMac, urlLinux, releaseNotes, isActive }),
      });
      if (res.ok) {
        form.reset();
        setShowCreateUpdate(false);
        loadAll();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create update");
      }
    } catch {
      setError("Network error while creating update");
    }
  };

  const handleUpdateToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch("/api/admin/updates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
        body: JSON.stringify({ id, isActive: !currentStatus }),
      });
      if (res.ok) {
        loadAll();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to toggle status");
      }
    } catch {
      setError("Network error toggling status");
    }
  };

  const handleUpdateDelete = async (id: string) => {
    if (!confirm("WARN: Destructive action. Delete update?")) return;
    try {
      const res = await fetch(`/api/admin/updates?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
      });
      if (res.ok) {
        loadAll();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete update");
      }
    } catch {
      setError("Network error deleting update");
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

  const handleProviderTest = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { status: "testing" } }));
    try {
      const res = await fetch("/api/admin/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
        body: JSON.stringify({ providerId: id }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(prev => ({ ...prev, [id]: { status: "success", latencyMs: data.latencyMs, model: data.model, response: data.response } }));
      } else {
        setTestResults(prev => ({ ...prev, [id]: { status: "error", latencyMs: data.latencyMs, error: typeof data.error === "string" ? data.error : JSON.stringify(data.error), model: data.model } }));
      }
    } catch (err: unknown) {
      setTestResults(prev => ({ ...prev, [id]: { status: "error", error: err instanceof Error ? err.message : "Network error" } }));
    }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error during provisioning");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error during update");
    }
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTenant) return;
    const form = e.target as HTMLFormElement;
    setIsRecordingPayment(true);
    setError("");

    try {
      const amountEl = form.elements.namedItem("amount") as HTMLInputElement | null;
      const dateEl = form.elements.namedItem("subscriptionEndsAt") as HTMLInputElement | null;
      const descEl = form.elements.namedItem("description") as HTMLInputElement | null;

      if (!amountEl || !dateEl || !descEl) {
        setError("Form elements not found. Please refresh the page.");
        setIsRecordingPayment(false);
        return;
      }

      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("ow_token")}`,
        },
        body: JSON.stringify({
          tenantId: paymentTenant.id,
          amount: parseFloat(amountEl.value),
          subscriptionEndsAt: dateEl.value,
          description: descEl.value,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al registrar el pago");
        setIsRecordingPayment(false);
        return;
      }

      setError("");
      setPaymentTenant(null);
      setDefaultExpiryDate("");
      loadAll();
    } catch (err: any) {
      setError("Error de red al registrar pago: " + (err?.message || String(err)));
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const loadTenantInvoices = async (tenantId: string) => {
    setIsLoadingInvoices(true);
    setTenantInvoices([]);
    try {
      const res = await fetch(`/api/admin/invoices?tenantId=${tenantId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTenantInvoices(data.invoices || []);
      } else {
        setError(data.error || "Error loading invoices");
      }
    } catch (err: any) {
      setError("Error loading invoices: " + (err?.message || String(err)));
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const handlePlanCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    try {
      const featuresRaw = (form.elements.namedItem("features") as HTMLTextAreaElement).value;
      const features = featuresRaw
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("ow_token")}`,
        },
        body: JSON.stringify({
          name: (form.elements.namedItem("planName") as HTMLInputElement).value,
          description: (form.elements.namedItem("planDescription") as HTMLTextAreaElement).value || undefined,
          tokenLimit: parseInt((form.elements.namedItem("tokenLimit") as HTMLInputElement).value),
          maxAgents: parseInt((form.elements.namedItem("maxAgents") as HTMLInputElement).value) || 1,
          maxUsers: parseInt((form.elements.namedItem("maxUsers") as HTMLInputElement).value) || 1,
          maxLicenses: parseInt((form.elements.namedItem("maxLicenses") as HTMLInputElement).value) || 1,
          price: parseFloat((form.elements.namedItem("price") as HTMLInputElement).value),
          billingPeriod: (form.elements.namedItem("billingPeriod") as HTMLSelectElement).value,
          isPublic: (form.elements.namedItem("isPublic") as HTMLInputElement).checked,
          sortOrder: parseInt((form.elements.namedItem("sortOrder") as HTMLInputElement).value) || 0,
          features,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to create plan");
        return;
      }
      setError("");
      form.reset();
      setShowCreatePlan(false);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error creating plan");
    }
  };

  const handlePlanUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    const form = e.target as HTMLFormElement;
    try {
      const featuresRaw = (form.elements.namedItem("features") as HTMLTextAreaElement).value;
      const features = featuresRaw
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);

      const res = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("ow_token")}`,
        },
        body: JSON.stringify({
          id: editingPlan.id,
          name: (form.elements.namedItem("planName") as HTMLInputElement).value,
          description: (form.elements.namedItem("planDescription") as HTMLTextAreaElement).value || undefined,
          tokenLimit: parseInt((form.elements.namedItem("tokenLimit") as HTMLInputElement).value),
          maxAgents: parseInt((form.elements.namedItem("maxAgents") as HTMLInputElement).value) || 1,
          maxUsers: parseInt((form.elements.namedItem("maxUsers") as HTMLInputElement).value) || 1,
          maxLicenses: parseInt((form.elements.namedItem("maxLicenses") as HTMLInputElement).value) || 1,
          price: parseFloat((form.elements.namedItem("price") as HTMLInputElement).value),
          billingPeriod: (form.elements.namedItem("billingPeriod") as HTMLSelectElement).value,
          isPublic: (form.elements.namedItem("isPublic") as HTMLInputElement).checked,
          sortOrder: parseInt((form.elements.namedItem("sortOrder") as HTMLInputElement).value) || 0,
          features,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to update plan");
        return;
      }
      setError("");
      setEditingPlan(null);
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error updating plan");
    }
  };

  const handlePlanDelete = async (id: string) => {
    const plan = plans.find((p) => p.id === id);
    if (!confirm(`WARN: Destructive action. Delete plan "${plan?.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/plans?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("ow_token")}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Failed to delete plan");
        return;
      }
      setError("");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error deleting plan");
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
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans antialiased overflow-hidden selection:bg-zinc-800 selection:text-white">
      
      {/* SIDEBAR: Command Center Navigation */}
      <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3 text-zinc-100 font-bold tracking-widest text-lg">
            <Terminal size={20} className="text-zinc-400" />
            <span>OMNIWORKER</span>
          </div>
          <div className="text-xs text-zinc-500 mt-1 font-mono uppercase tracking-widest">Superadmin Root</div>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button onClick={() => setView("dashboard")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "dashboard" ? "bg-zinc-800 text-zinc-300 font-semibold" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Activity size={18} /> Business Metrics
          </button>
          <button onClick={() => setView("tenants")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "tenants" ? "bg-zinc-800 text-zinc-300 font-semibold" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Box size={18} /> Tenants (Clients)
          </button>
          <button onClick={() => setView("providers")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "providers" ? "bg-zinc-800 text-zinc-300 font-semibold" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Cpu size={18} /> LLM Providers
          </button>
          <button onClick={() => setView("plans")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "plans" ? "bg-zinc-800 text-zinc-300 font-semibold" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Database size={18} /> Subscriptions
          </button>
          <button onClick={() => setView("audit")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "audit" ? "bg-zinc-800 text-zinc-300 font-semibold" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <ShieldAlert size={18} /> Security & Audit
          </button>
          <button onClick={() => setView("updates")} className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${view === "updates" ? "bg-zinc-800 text-zinc-300 font-semibold" : "hover:bg-zinc-800/50 hover:text-zinc-100"}`}>
            <Download size={18} /> System Updates
          </button>
        </nav>

        <div className="p-4 border-t border-zinc-800 text-xs font-mono text-zinc-600 flex justify-between">
          <span>SYS_STATUS:</span>
          <span className="text-zinc-400">ONLINE</span>
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
                <div className="text-3xl font-bold text-white flex items-center gap-2"><DollarSign size={24} className="text-zinc-400"/>{totalMRR.toFixed(2)}</div>
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
                  <Activity size={18} className="text-zinc-400" />
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
                          <td className="px-4 py-3 font-medium text-zinc-300 font-semibold">{m.model}</td>
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
                  <DollarSign size={18} className="text-zinc-400" />
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
                          <span className={`font-mono ${percent >= 80 ? "text-red-400 font-bold" : "text-zinc-300 font-semibold"}`}>{(remaining/1000).toFixed(0)}k</span>
                          <div className="w-24 h-1.5 bg-zinc-800 overflow-hidden">
                            <div className={`h-full ${percent >= 80 ? "bg-red-500 animate-pulse" : "bg-white"}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
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
                        {t.isActive ? <span className="text-zinc-400 text-xs font-mono bg-zinc-900 px-2 py-1">ACTIVE</span> : <span className="text-red-500 text-xs font-mono bg-red-500/10 px-2 py-1">SUSPENDED</span>}
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
                    <select name="provider" onChange={(e) => setSelectedFormProvider(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors">
                      {providerOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>

                  {/* OpenCode Go: Intelligent Routing Banner */}
                  {selectedFormProvider === "opencode-go" && (
                    <div className="border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-zinc-300 font-semibold" />
                        <span className="text-xs font-bold text-zinc-300 font-semibold uppercase tracking-wider">Intelligent Auto-Routing Active</span>
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
                    <input name="nameInput" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-700" placeholder={selectedFormProvider === "opencode-go" ? "e.g. OpenCode Go Primary" : "e.g. OpenAI Primary"} />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Secret Key</label>
                    <input name="apiKey" type="password" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-700 font-mono text-sm" placeholder="sk-..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Priority (1 = High)</label>
                      <input name="priority" type="number" defaultValue="1" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Daily Cap (Ops)</label>
                      <input name="dailyLimit" type="number" placeholder="∞" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-white text-black border border-zinc-200 p-3 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors mt-2">
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
                    <div key={p.id} className={`bg-zinc-900 border p-5 group hover:border-zinc-700 transition-colors relative overflow-hidden ${isOpenCodeGo ? "border-zinc-800" : "border-zinc-800"}`}>
                      <div className="absolute top-0 right-0 p-4">
                        <span className={`w-2 h-2 block rounded-full ${p.isActive ? "bg-white animate-pulse" : "bg-red-500"}`}></span>
                      </div>
                      <div className="text-lg font-medium text-white mb-1">{p.name}</div>
                      
                      {isOpenCodeGo ? (
                        <div className="mb-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono uppercase bg-zinc-900 text-zinc-300 font-semibold px-2 py-1 border border-zinc-800 flex items-center gap-1.5">
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
                            <span>MODEL_SELECT</span><span className="text-zinc-300 font-semibold">AUTO (Complexity-Based)</span>
                          </div>
                        )}
                        <div className="flex justify-between pb-1">
                          <span>LIMIT</span><span className="text-zinc-200">{p.dailyLimit || "UNLIMITED"}</span>
                        </div>
                      </div>

                      {/* Test Result Banner */}
                      {testResults[p.id] && (
                        <div className={`mt-4 p-3 border text-xs font-mono ${
                          testResults[p.id].status === "testing" ? "border-zinc-700 bg-zinc-950 text-zinc-400" :
                          testResults[p.id].status === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" :
                          "border-red-500/30 bg-red-500/5 text-red-400"
                        }`}>
                          {testResults[p.id].status === "testing" && (
                            <div className="flex items-center gap-2">
                              <Loader2 size={12} className="animate-spin" />
                              <span>TESTING CONNECTION...</span>
                            </div>
                          )}
                          {testResults[p.id].status === "success" && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={12} />
                                <span className="font-bold">KEY VALID</span>
                                <span className="text-zinc-500">· {testResults[p.id].latencyMs}ms</span>
                              </div>
                              <div className="text-zinc-500 truncate">Model: {testResults[p.id].model} · \"{testResults[p.id].response}\"</div>
                            </div>
                          )}
                          {testResults[p.id].status === "error" && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <XCircle size={12} />
                                <span className="font-bold">KEY FAILED</span>
                                {testResults[p.id].latencyMs ? <span className="text-zinc-500">· {testResults[p.id].latencyMs}ms</span> : null}
                              </div>
                              <div className="text-red-300/70 truncate">{testResults[p.id].error}</div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-between items-center">
                        <button 
                          onClick={() => handleProviderTest(p.id)} 
                          disabled={testResults[p.id]?.status === "testing"}
                          className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-wait"
                        >
                          <FlaskConical size={12} />
                          {testResults[p.id]?.status === "testing" ? "Testing..." : "Test Key"}
                        </button>
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
                    <Activity size={14} className="text-zinc-400" />
                    OpenCode Go — Intelligent Auto-Routing
                  </h2>
                  <p className="text-xs text-zinc-500 font-mono mb-5">Requests are automatically classified by complexity and routed to the optimal model tier. Higher weight = higher selection probability within tier.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(opencodeGoTiers).map(([tierKey, tier]) => {
                      const tierColors: Record<string, { border: string; badge: string; bar: string; text: string; icon: string }> = {
                        reasoning: { border: "border-purple-500/40", badge: "bg-purple-500/15 text-purple-400 border-purple-500/30", bar: "bg-purple-500", text: "text-purple-400", icon: "🧠" },
                        balanced:  { border: "border-zinc-800",   badge: "bg-zinc-900 text-zinc-300 font-semibold border-zinc-800",     bar: "bg-white",   text: "text-zinc-300 font-semibold",   icon: "⚖️" },
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
                className="bg-white text-black border border-zinc-200 px-6 py-2 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors"
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
                     <input name="tenantName" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-800/50" placeholder="Type name here..." />
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Subscription Protocol</label>
                     <select name="planId" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors">
                       <option value="">[UNASSIGNED]</option>
                       {plans.map(p => <option key={p.id} value={p.id}>{p.name} - ${(p.price).toFixed(2)}</option>)}
                     </select>
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Plan Expiry Date</label>
                     <input name="subscriptionEndsAt" type="date" className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors [&::-webkit-calendar-picker-indicator]:invert-[0.8]" />
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Root Email *</label>
                     <input name="adminEmail" type="email" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-800/50" placeholder="Type email..." />
                   </div>
                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Initial Keyphrase *</label>
                     <input name="adminPassword" type="password" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-800/50" placeholder="Type password..." />
                   </div>
                   <div className="md:col-span-3 lg:col-span-5 flex justify-end">
                     <button type="submit" className="bg-white text-black border border-zinc-200 px-8 py-3 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors">
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
                    <th className="px-6 py-4 text-center">Licenses</th>
                    <th className="px-6 py-4 text-center">Users</th>
                    <th className="px-6 py-4 text-center">Agents</th>
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {tenants.map(t => {
                    const activeLicCount = t.licenses ? t.licenses.filter(l => l.status === "ACTIVE").length : 0;
                    const maxLicLimit = t.plan?.maxLicenses ?? 1;
                    return (
                      <tr key={t.id} className="hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {t.isActive ? <span className="w-2 h-2 inline-block bg-white rounded-full animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.15)]"></span> : <span className="w-2 h-2 inline-block bg-red-500 rounded-full"></span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-white">{t.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500">{t.slug}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{t.plan?.name || "NONE"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center font-bold">
                          <span className={activeLicCount >= maxLicLimit ? "text-amber-500" : "text-zinc-300 font-semibold"}>
                            {activeLicCount}
                          </span>
                          <span className="text-zinc-600"> / </span>
                          <span className="text-zinc-400">{maxLicLimit}</span>
                        </td>
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
                            className="text-xs font-mono text-zinc-400 hover:text-zinc-300 font-semibold uppercase tracking-widest transition-colors"
                          >
                            Modify
                          </button>
                          <button
                            onClick={() => {
                              setViewingInvoicesTenant(t);
                              loadTenantInvoices(t.id);
                            }}
                            className="text-xs font-mono text-emerald-500 hover:text-emerald-400 uppercase tracking-widest transition-colors"
                          >
                            Invoices
                          </button>
                          <button
                            onClick={() => {
                              setPaymentTenant(t);
                              const nextDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                              setDefaultExpiryDate(nextDate);
                            }}
                            className="text-xs font-mono text-amber-500 hover:text-amber-400 uppercase tracking-widest transition-colors"
                          >
                            Record Payment
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-zinc-600">No tenants found.</td>
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
                        <input name="tenantName" defaultValue={editingTenant.name} required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Subscription Protocol</label>
                        <select name="planId" defaultValue={editingTenant.plan?.id || ""} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors">
                          <option value="">[UNASSIGNED]</option>
                          {plans.map(p => <option key={p.id} value={p.id}>{p.name} - ${(p.price).toFixed(2)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Plan Expiry Date</label>
                        <input name="subscriptionEndsAt" type="date" defaultValue={editingTenant.subscriptionEndsAt ? new Date(editingTenant.subscriptionEndsAt).toISOString().split('T')[0] : ""} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors [&::-webkit-calendar-picker-indicator]:invert-[0.8]" />
                      </div>
                      <div className="flex items-end pb-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" name="isActive" defaultChecked={editingTenant.isActive} className="w-5 h-5 accent-zinc-100 bg-zinc-950 border border-zinc-800" />
                          <span className="text-sm font-mono text-zinc-300 uppercase tracking-widest">Active Workspace</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-4 mt-8 pt-4 border-t border-zinc-800">
                      <button type="button" onClick={() => setEditingTenant(null)} className="text-zinc-400 hover:text-white uppercase text-xs font-bold tracking-widest px-4 py-2">
                        Cancel
                      </button>
                      <button type="submit" className="bg-white text-black border border-zinc-200 px-6 py-2 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors">
                        Save Changes
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* RECORD MANUAL PAYMENT MODAL */}
            {paymentTenant && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
                  <h2 className="text-lg font-bold text-white uppercase tracking-wider mb-6 border-b border-zinc-800 pb-2">Record Payment: {paymentTenant.name}</h2>
                  <form onSubmit={handleRecordPaymentSubmit} className="space-y-5">
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Payment Amount ($ USD) *</label>
                      <input name="amount" type="number" step="0.01" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono" placeholder="e.g. 150.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">New Expiration Date *</label>
                      <input
                        name="subscriptionEndsAt"
                        type="date"
                        required
                        value={defaultExpiryDate}
                        onChange={(e) => setDefaultExpiryDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors [&::-webkit-calendar-picker-indicator]:invert-[0.8]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Concept / Billing Description *</label>
                      <input name="description" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors" placeholder="e.g. Pago de suscripción mensual Pro" />
                    </div>
                    <div className="flex justify-end gap-4 mt-8 pt-4 border-t border-zinc-800">
                      <button type="button" onClick={() => { setPaymentTenant(null); setDefaultExpiryDate(""); }} className="text-zinc-400 hover:text-white uppercase text-xs font-bold tracking-widest px-4 py-2">
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isRecordingPayment}
                        className="bg-white text-black border border-zinc-200 px-6 py-2 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRecordingPayment ? "Processing..." : "Record Payment & Extend"}
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
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                                    {a.status === "online" ? <span className="text-zinc-400">ONLINE</span> : <span className="text-zinc-500">OFFLINE</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Licensed Installations ({t.licenses?.length || 0})</h3>
                          {t.licenses?.length === 0 ? (
                            <div className="text-zinc-600 text-xs font-mono italic p-4 border border-dashed border-zinc-800">No active B2B licenses.</div>
                          ) : (
                            <div className="space-y-2">
                              {t.licenses?.map(lic => (
                                <div key={lic.id} className="bg-zinc-950 border border-zinc-800 p-3 flex flex-col gap-1 text-xs font-mono">
                                  <div className="flex justify-between items-center">
                                    <span className="text-zinc-200 font-bold">{lic.name}</span>
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 border uppercase ${lic.status === "ACTIVE" ? "bg-zinc-900 border-zinc-800 text-zinc-300 font-semibold" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                                      {lic.status}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-zinc-500 break-all">Fingerprint: {lic.deviceFingerprint || "Browser/Web"}</div>
                                  <div className="text-[10px] text-zinc-500">
                                    Last seen: {lic.lastSeenAt ? new Date(lic.lastSeenAt).toLocaleString() : "Never"} &middot; <span className="text-zinc-300 font-semibold font-bold">{(lic.tokenBalance ?? 0).toLocaleString()} tokens</span>
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

            {/* INVOICES MODAL */}
            {viewingInvoicesTenant && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-zinc-900 border border-zinc-800 p-6 w-full max-w-4xl max-h-[85vh] overflow-auto animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                        Invoices: {viewingInvoicesTenant.name}
                      </h2>
                      <p className="text-xs text-zinc-500 font-mono mt-1">
                        {tenantInvoices.length} payment record(s) found
                      </p>
                    </div>
                    <button
                      onClick={() => { setViewingInvoicesTenant(null); setTenantInvoices([]); }}
                      className="text-zinc-400 hover:text-white text-xl leading-none"
                    >
                      ✕
                    </button>
                  </div>

                  {isLoadingInvoices ? (
                    <div className="py-12 text-center text-zinc-500 font-mono text-sm uppercase tracking-widest animate-pulse">
                      Loading invoices...
                    </div>
                  ) : tenantInvoices.length === 0 ? (
                    <div className="py-12 text-center text-zinc-600 font-mono text-sm uppercase tracking-widest border border-dashed border-zinc-800">
                      No invoices found for this tenant.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono text-sm text-zinc-300">
                        <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase">
                          <tr>
                            <th className="px-4 py-3">Invoice #</th>
                            <th className="px-4 py-3">Amount</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {tenantInvoices.map((inv) => (
                            <tr key={inv.id} className="hover:bg-zinc-800/50 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap font-medium text-white">{inv.invoiceNumber}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-mono">
                                ${inv.amount.toFixed(2)} <span className="text-zinc-500">{inv.currency}</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`text-[10px] font-mono px-2 py-0.5 border uppercase tracking-wider ${inv.status === "PAID" ? "bg-zinc-900 border-zinc-800 text-zinc-300 font-semibold" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                                  {inv.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-zinc-400">{inv.paymentMethod}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-zinc-500">
                                {new Date(inv.paidAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">{inv.description || "—"}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <a
                                  href={`/api/admin/invoices/${inv.id}/pdf`}
                                  download={`factura-${inv.invoiceNumber}.pdf`}
                                  className="text-xs font-mono text-zinc-300 font-semibold hover:text-white uppercase tracking-widest transition-colors border border-zinc-700 px-2 py-1"
                                >
                                  Download PDF
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- VIEW: PLANS --- */}
        {view === "plans" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight uppercase">Subscription Protocols</h1>
                <p className="text-zinc-500 font-mono text-sm mt-1">Define capabilities, token limits, and pricing for tenant workspaces.</p>
              </div>
              <button
                onClick={() => setShowCreatePlan(!showCreatePlan)}
                className="bg-white text-black border border-zinc-200 px-6 py-2 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors"
              >
                {showCreatePlan ? "Cancel" : "Create Plan"}
              </button>
            </div>

            {/* CREATE / EDIT FORM */}
            {(showCreatePlan || editingPlan) && (
              <div className="bg-zinc-900 border border-zinc-800 p-6 animate-in slide-in-from-top-2 duration-300">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
                  <Database size={16} />
                  {editingPlan ? `Edit Plan: ${editingPlan.name}` : "New Subscription Plan"}
                </h2>
                <form
                  onSubmit={editingPlan ? handlePlanUpdate : handlePlanCreate}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Plan Name *</label>
                    <input
                      name="planName"
                      defaultValue={editingPlan?.name || ""}
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-800/50"
                      placeholder="e.g. Pro B2B"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Token Limit *</label>
                    <input
                      name="tokenLimit"
                      type="number"
                      defaultValue={editingPlan?.tokenLimit || 100000}
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Price (USD) *</label>
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      defaultValue={editingPlan?.price || 0}
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono"
                      placeholder="e.g. 49.99"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Max Agents</label>
                    <input
                      name="maxAgents"
                      type="number"
                      defaultValue={editingPlan?.maxAgents || 1}
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Max Users</label>
                    <input
                      name="maxUsers"
                      type="number"
                      defaultValue={editingPlan?.maxUsers || 1}
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Max Licenses</label>
                    <input
                      name="maxLicenses"
                      type="number"
                      defaultValue={editingPlan?.maxLicenses || 1}
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Billing Period</label>
                    <select
                      name="billingPeriod"
                      defaultValue={editingPlan?.billingPeriod || "monthly"}
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Sort Order</label>
                    <input
                      name="sortOrder"
                      type="number"
                      defaultValue={editingPlan?.sortOrder || 0}
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono"
                    />
                  </div>
                  <div className="flex items-end pb-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="isPublic"
                        defaultChecked={editingPlan ? editingPlan.isPublic : true}
                        className="w-5 h-5 accent-zinc-100 bg-zinc-950 border border-zinc-800"
                      />
                      <span className="text-sm font-mono text-zinc-300 uppercase tracking-widest">Public Plan</span>
                    </label>
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Description</label>
                    <input
                      name="planDescription"
                      defaultValue={editingPlan?.description || ""}
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-800/50"
                      placeholder="Short description of the plan..."
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Features (one per line)</label>
                    <textarea
                      name="features"
                      rows={3}
                      defaultValue={
                        editingPlan
                          ? (() => {
                              try {
                                return JSON.parse(editingPlan.features).join("\n");
                              } catch {
                                return editingPlan.features || "";
                              }
                            })()
                          : ""
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-800/50"
                      placeholder="e.g. 1M tokens/month&#10;Priority support&#10;Unlimited tools"
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreatePlan(false);
                        setEditingPlan(null);
                      }}
                      className="text-zinc-400 hover:text-white uppercase text-xs font-bold tracking-widest px-4 py-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-white text-black border border-zinc-200 px-8 py-3 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors"
                    >
                      {editingPlan ? "Save Changes" : "Create Plan"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* PLANS TABLE */}
            <div className="bg-zinc-900 border border-zinc-800 overflow-x-auto">
              <table className="w-full text-left font-mono text-sm text-zinc-300">
                <thead className="bg-zinc-950 text-zinc-500 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-4">Order</th>
                    <th className="px-6 py-4">Plan Name</th>
                    <th className="px-6 py-4">Token Limit</th>
                    <th className="px-6 py-4">Price</th>
                    <th className="px-6 py-4 text-center">Agents</th>
                    <th className="px-6 py-4 text-center">Users</th>
                    <th className="px-6 py-4 text-center">Licenses</th>
                    <th className="px-6 py-4 text-center">Tenants</th>
                    <th className="px-6 py-4">Visibility</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {[...plans]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500">{p.sortOrder}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-white">{p.name}</div>
                          {p.description && <div className="text-xs text-zinc-500 truncate max-w-xs">{p.description}</div>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-mono">{(p.tokenLimit / 1000).toFixed(0)}k</td>
                        <td className="px-6 py-4 whitespace-nowrap font-mono">${p.price.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">{p.maxAgents}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">{p.maxUsers}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">{p.maxLicenses}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="text-zinc-300 font-semibold">{p._count?.tenants || 0}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {p.isPublic ? (
                            <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold uppercase tracking-wider">Public</span>
                          ) : (
                            <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-950 border border-zinc-800 text-zinc-500 uppercase tracking-wider">Hidden</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-4">
                          <button
                            onClick={() => setEditingPlan(p)}
                            className="text-xs font-mono text-zinc-400 hover:text-zinc-300 font-semibold uppercase tracking-widest transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handlePlanDelete(p.id)}
                            className="text-xs font-mono text-red-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  {plans.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-8 text-center text-zinc-600">
                        No subscription plans defined. Create one to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- VIEW: SECURITY --- */}
        {view === "audit" && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <h1 className="text-2xl font-bold text-white tracking-tight uppercase flex items-center gap-3">
               <ShieldAlert size={28} className="text-zinc-400" />
               Security & Audit Log
             </h1>
             <div className="bg-zinc-900 border-l-4 border-white p-6">
                <div className="text-zinc-300 font-semibold font-mono font-bold mb-2">IMMUTABLE LEDGER ACTIVE</div>
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
                       <td className="px-6 py-4 whitespace-nowrap font-bold text-zinc-300 font-semibold">{log.action}</td>
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

        {/* --- VIEW: SYSTEM UPDATES --- */}
        {view === "updates" && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight uppercase flex items-center gap-3">
                  <Download size={28} className="text-zinc-400" />
                  System Updates Manager
                </h1>
                <p className="text-zinc-500 font-mono text-sm mt-1">Publish new desktop/agent version payloads with targeted OS links.</p>
              </div>
              <button 
                onClick={() => setShowCreateUpdate(!showCreateUpdate)} 
                className="bg-white text-black border border-zinc-200 px-6 py-2 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors"
              >
                {showCreateUpdate ? "Cancel" : "Publish Update"}
              </button>
            </div>

            {showCreateUpdate && (
              <div className="bg-zinc-900 border border-zinc-800 p-6 animate-in slide-in-from-top-2 duration-300">
                 <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
                   <Download size={16}/> Release Update Payload
                 </h2>
                 <form onSubmit={handleUpdateCreate} className="space-y-5">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                       <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Software Version (e.g. 1.0.4) *</label>
                       <input name="version" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-850" placeholder="e.g. 1.0.4" />
                     </div>
                     <div className="flex items-end pb-3">
                       <label className="flex items-center gap-3 cursor-pointer">
                         <input type="checkbox" name="isActive" defaultChecked={true} className="w-5 h-5 accent-zinc-100 bg-zinc-950 border border-zinc-800" />
                         <span className="text-sm font-mono text-zinc-300 uppercase tracking-widest">Mark Active (deactivates others)</span>
                       </label>
                     </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div>
                       <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Windows Download URL *</label>
                       <input name="urlWindows" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono placeholder:text-zinc-850" placeholder="https://..." />
                     </div>
                     <div>
                       <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">macOS Download URL *</label>
                       <input name="urlMac" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono placeholder:text-zinc-850" placeholder="https://..." />
                     </div>
                     <div>
                       <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Linux Download URL *</label>
                       <input name="urlLinux" required className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors font-mono placeholder:text-zinc-850" placeholder="https://..." />
                     </div>
                   </div>

                   <div>
                     <label className="block text-xs font-mono text-zinc-500 mb-2 uppercase">Release Notes & Instructions (Markdown supported)</label>
                     <textarea name="releaseNotes" rows={4} className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-800" placeholder="Describe the updates, improvements, bug fixes..." />
                   </div>

                   <div className="flex justify-end">
                     <button type="submit" className="bg-white text-black border border-zinc-200 px-8 py-3 font-bold uppercase tracking-wider text-sm hover:bg-zinc-200 transition-colors">
                       Deploy System Update
                     </button>
                   </div>
                 </form>
              </div>
            )}

            {/* Registered Updates List */}
            <div className="bg-zinc-900 border border-zinc-800">
              <div className="p-4 border-b border-zinc-800 bg-zinc-950/40 text-xs font-mono text-zinc-500 uppercase tracking-widest">
                System Update History
              </div>
              
              {updates.length === 0 ? (
                <div className="p-12 text-center text-zinc-600 font-mono text-sm uppercase tracking-widest">
                  No system updates have been released yet.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {updates.map(up => (
                    <div key={up.id} className="p-6 hover:bg-zinc-850/10 transition-colors space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold text-white font-mono">v{up.version}</span>
                          {up.isActive ? (
                            <span className="bg-zinc-900 text-zinc-300 font-semibold border border-zinc-700 px-2.5 py-0.5 text-xs font-mono uppercase tracking-wider animate-pulse">
                              Active Update
                            </span>
                          ) : (
                            <span className="bg-zinc-850 text-zinc-500 border border-zinc-800 px-2.5 py-0.5 text-xs font-mono uppercase tracking-wider">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => handleUpdateToggleActive(up.id, up.isActive)}
                            className={`text-xs font-mono uppercase tracking-widest px-3 py-1 border transition-colors ${up.isActive ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : "border-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-900"}`}
                          >
                            {up.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button 
                            onClick={() => handleUpdateDelete(up.id)}
                            className="text-xs font-mono text-red-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                        <div className="bg-zinc-950 p-3 border border-zinc-800">
                          <span className="text-zinc-600 block mb-1 uppercase text-[10px]">Windows Link</span>
                          <a href={up.urlWindows} target="_blank" rel="noreferrer" className="text-zinc-300 font-semibold hover:underline break-all">{up.urlWindows}</a>
                        </div>
                        <div className="bg-zinc-950 p-3 border border-zinc-800">
                          <span className="text-zinc-600 block mb-1 uppercase text-[10px]">macOS Link</span>
                          <a href={up.urlMac} target="_blank" rel="noreferrer" className="text-zinc-300 font-semibold hover:underline break-all">{up.urlMac}</a>
                        </div>
                        <div className="bg-zinc-950 p-3 border border-zinc-800">
                          <span className="text-zinc-600 block mb-1 uppercase text-[10px]">Linux Link</span>
                          <a href={up.urlLinux} target="_blank" rel="noreferrer" className="text-zinc-300 font-semibold hover:underline break-all">{up.urlLinux}</a>
                        </div>
                      </div>

                      {up.releaseNotes && (
                        <div className="bg-zinc-950/60 p-4 border border-zinc-800/80 rounded-sm">
                          <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-2 font-mono">Release Notes:</span>
                          <div className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{up.releaseNotes}</div>
                        </div>
                      )}

                      <div className="text-right text-[10px] font-mono text-zinc-600">
                        Released on {new Date(up.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
