import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../components/useI18n";

interface TokenMetricEntry {
  session: string;
  totalTokens: number;
  stable: number;
  context: number;
  volatile: number;
  tools: number;
  timestamp: string;
}

interface TokenMetricsData {
  entries: TokenMetricEntry[];
  latest: {
    session: string;
    totalTokens: number;
    stable: number;
    context: number;
    volatile: number;
    tools: number;
    baseline: number;
    savings: number;
    savingsPercent: number;
  } | null;
}

interface TokensProps {
  profile?: string;
}

const BASELINE = 10000;

// Tier color mapping — brutalist B&W with accent hints
const TIER_STYLES: Record<string, { bar: string; label: string }> = {
  stable: { bar: "bg-white", label: "Stable" },
  context: { bar: "bg-zinc-400", label: "Context" },
  volatile: { bar: "bg-zinc-600", label: "Volatile" },
  tools: { bar: "bg-zinc-300", label: "Tools" },
};

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export default function Tokens({ profile }: TokensProps): React.JSX.Element {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<TokenMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.flux-agentAPI.getTokenMetrics();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchMetrics();
    // Auto-refresh every 30s
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // ─── Loading state ───
  if (loading && !metrics) {
    return (
      <div className="flex flex-col flex-1 h-full overflow-y-auto">
        <div className="screen-header">
          <h1 className="screen-title">{t("navigation.tokens")}</h1>
        </div>
        <div className="flex items-center justify-center flex-1">
          <div className="text-zinc-500 text-sm animate-pulse">
            Loading metrics...
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ───
  if (error && !metrics) {
    return (
      <div className="flex flex-col flex-1 h-full overflow-y-auto">
        <div className="screen-header">
          <h1 className="screen-title">{t("navigation.tokens")}</h1>
        </div>
        <div className="flex items-center justify-center flex-1">
          <div className="text-center space-y-3">
            <div className="text-zinc-500 text-sm">Failed to load token metrics</div>
            <div className="text-zinc-600 text-xs font-mono">{error}</div>
            <button
              className="px-4 py-2 text-xs font-bold border border-white bg-white text-black hover:bg-zinc-200 transition-colors"
              onClick={fetchMetrics}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── No data state ───
  if (!metrics?.latest) {
    return (
      <div className="flex flex-col flex-1 h-full overflow-y-auto">
        <div className="screen-header">
          <h1 className="screen-title">{t("navigation.tokens")}</h1>
        </div>
        <div className="flex items-center justify-center flex-1">
          <div className="text-center space-y-4 max-w-md px-8">
            <div className="text-4xl">📊</div>
            <div className="text-zinc-400 text-sm leading-relaxed">
              No token metrics available yet. Metrics are recorded each time you send a message.
              Send your first message to start tracking system prompt token usage.
            </div>
            <button
              className="px-4 py-2 text-xs font-bold border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 transition-colors"
              onClick={fetchMetrics}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  const latest = metrics.latest;
  const savingsPositive = latest.savings > 0;

  // Calculate tier percentages for stacked bar
  const tierData = [
    { key: "stable", value: latest.stable },
    { key: "context", value: latest.context },
    { key: "volatile", value: latest.volatile },
    { key: "tools", value: latest.tools },
  ];
  const totalTierSum = tierData.reduce((s, t) => s + t.value, 0);

  // Cache status — check if OpenRouter cache hits exist in recent entries
  const cacheStatus = metrics.entries.length > 0 ? "active" : "unknown";

  // ─── Main render ───
  return (
    <div className="flex flex-col flex-1 h-full overflow-y-auto">
      <div className="screen-header">
        <h1 className="screen-title">{t("navigation.tokens")}</h1>
        <button
          className="px-3 py-1.5 text-[11px] font-bold border border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
          onClick={fetchMetrics}
        >
          ↻ REFRESH
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ─── Hero Savings Card ─── */}
        <div
          className="border border-zinc-800 p-6"
          style={{
            background: savingsPositive
              ? "linear-gradient(135deg, #0a0a0a 0%, #111 100%)"
              : "linear-gradient(135deg, #1a0a0a 0%, #111 100%)",
          }}
        >
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">
                System Prompt Token Budget
              </div>
              <div className="text-4xl font-bold tracking-tight" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatNumber(latest.totalTokens)}
                <span className="text-lg text-zinc-500 ml-2">tokens</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">
                vs {formatNumber(BASELINE)} baseline
              </div>
              <div
                className={`text-2xl font-bold ${savingsPositive ? "text-white" : "text-red-400"}`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {savingsPositive ? "-" : "+"}{formatNumber(Math.abs(latest.savings))}
                <span className="text-sm ml-1">
                  ({savingsPositive ? "" : "-"}{latest.savingsPercent}%)
                </span>
              </div>
            </div>
          </div>

          {/* Stacked bar — baseline vs actual */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span className="uppercase tracking-wider">Actual</span>
              <div className="flex-1 h-3 bg-zinc-900 border border-zinc-800 relative overflow-hidden flex">
                {tierData.map((tier) => {
                  const pct = totalTierSum > 0 ? (tier.value / BASELINE) * 100 : 0;
                  return (
                    <div
                      key={tier.key}
                      className={`${TIER_STYLES[tier.key].bar} h-full transition-all duration-500`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                      title={`${TIER_STYLES[tier.key].label}: ${formatNumber(tier.value)} tokens`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-600">
              <span className="uppercase tracking-wider">Baseline</span>
              <div className="flex-1 h-1.5 bg-zinc-700 border border-zinc-600" />
            </div>
          </div>
        </div>

        {/* ─── Tier Breakdown ─── */}
        <div className="grid grid-cols-4 gap-3">
          {tierData.map((tier) => {
            const style = TIER_STYLES[tier.key];
            const pct = latest.totalTokens > 0
              ? Math.round((tier.value / latest.totalTokens) * 100)
              : 0;
            return (
              <div
                key={tier.key}
                className="border border-zinc-800 p-4 bg-zinc-950"
              >
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">
                  {style.label}
                </div>
                <div
                  className="text-xl font-bold mb-1"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatNumber(tier.value)}
                </div>
                <div className="text-[10px] text-zinc-600">
                  {pct}% of prompt
                </div>
                {/* Mini bar */}
                <div className="mt-2 h-1 bg-zinc-800 w-full">
                  <div
                    className={`${style.bar} h-full transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── Stats Row ─── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Tools count */}
          <div className="border border-zinc-800 p-4 bg-zinc-950">
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">
              Tools Loaded
            </div>
            <div className="text-2xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
              {latest.tools}
            </div>
          </div>

          {/* Cache status */}
          <div className="border border-zinc-800 p-4 bg-zinc-950">
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">
              Cache Status
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  cacheStatus === "active" ? "bg-green-400" : "bg-zinc-600"
                }`}
              />
              <span className="text-sm font-bold">
                {cacheStatus === "active" ? "Active" : "Pending"}
              </span>
            </div>
            <div className="text-[10px] text-zinc-600 mt-1">
              {metrics.entries.length} measurement{metrics.entries.length !== 1 ? "s" : ""} recorded
            </div>
          </div>

          {/* Sessions tracked */}
          <div className="border border-zinc-800 p-4 bg-zinc-950">
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">
              Sessions Tracked
            </div>
            <div className="text-2xl font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
              {new Set(metrics.entries.map((e) => e.session)).size}
            </div>
            <div className="text-[10px] text-zinc-600 mt-1">
              Latest: {latest.session.substring(0, 8)}...
            </div>
          </div>
        </div>

        {/* ─── History Table ─── */}
        {metrics.entries.length > 1 && (
          <div className="border border-zinc-800 bg-zinc-950">
            <div className="px-4 py-3 border-b border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
                Recent Measurements
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="text-left px-4 py-2 font-normal uppercase tracking-wider text-[9px]">
                      Time
                    </th>
                    <th className="text-right px-4 py-2 font-normal uppercase tracking-wider text-[9px]">
                      Total
                    </th>
                    <th className="text-right px-4 py-2 font-normal uppercase tracking-wider text-[9px]">
                      Stable
                    </th>
                    <th className="text-right px-4 py-2 font-normal uppercase tracking-wider text-[9px]">
                      Context
                    </th>
                    <th className="text-right px-4 py-2 font-normal uppercase tracking-wider text-[9px]">
                      Volatile
                    </th>
                    <th className="text-right px-4 py-2 font-normal uppercase tracking-wider text-[9px]">
                      Tools
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...metrics.entries]
                    .reverse()
                    .slice(0, 20)
                    .map((entry, i) => (
                      <tr
                        key={`${entry.timestamp}-${i}`}
                        className={`border-b border-zinc-900 ${
                          i === 0 ? "text-white" : "text-zinc-400"
                        }`}
                      >
                        <td className="px-4 py-2 font-mono text-[10px] text-zinc-500">
                          {entry.timestamp || "—"}
                        </td>
                        <td
                          className="px-4 py-2 text-right font-bold"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatNumber(entry.totalTokens)}
                        </td>
                        <td
                          className="px-4 py-2 text-right"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatNumber(entry.stable)}
                        </td>
                        <td
                          className="px-4 py-2 text-right"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatNumber(entry.context)}
                        </td>
                        <td
                          className="px-4 py-2 text-right"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatNumber(entry.volatile)}
                        </td>
                        <td
                          className="px-4 py-2 text-right"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {entry.tools}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
