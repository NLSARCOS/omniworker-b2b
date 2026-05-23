import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "../../components/ThemeProvider";
import { THEME_OPTIONS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import { APP_LOCALES, type AppLocale } from "../../../../shared/i18n";
import { 
  Check, 
  ChevronDown, 
  Download, 
  Upload, 
  Cpu,
  Palette,
  Network,
  ShieldCheck,
  Activity,
  Terminal,
  RefreshCw,
  AlertTriangle
} from "lucide-react";

const LANGUAGE_NATIVE_NAMES: Record<AppLocale, string> = {
  en: "English",
  es: "Español",
  id: "Bahasa Indonesia",
  ja: "日本語",
  "pt-BR": "Português",
  "zh-CN": "中文",
};

function getCachedVersion(): string | null {
  try {
    return localStorage.getItem("omniworker-version-cache");
  } catch {
    return null;
  }
}

function getCachedOmniWorker(): { found: boolean; path: string | null } | null {
  try {
    const raw = localStorage.getItem("omniworker-omniworker-cache");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function Settings({ profile }: { profile?: string }): React.JSX.Element {
  const { t, locale, setLocale } = useI18n();
  const [omniworkerHome, setOmniWorkerHome] = useState("");
  const { theme, setTheme } = useTheme();

  // Engine state
  const [omniworkerVersion, setOmniWorkerVersion] = useState<string | null>(getCachedVersion);
  const [appVersion, setAppVersion] = useState("");
  const [doctorOutput, setDoctorOutput] = useState<string | null>(null);
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  const [updateResultType, setUpdateResultType] = useState<"success" | "error" | null>(null);

  // Migration state
  const cachedClaw = getCachedOmniWorker();
  const [omniworkerFound, setOpenclawFound] = useState(cachedClaw?.found ?? false);
  const [omniworkerPath, setOpenclawPath] = useState<string | null>(cachedClaw?.path ?? null);
  const [migrationDismissed, setMigrationDismissed] = useState(
    () => localStorage.getItem("omniworker-omniworker-dismissed") === "true",
  );
  const [migrating, setMigrating] = useState(false);
  const [migrationLog, setMigrationLog] = useState("");
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [migrationResultType, setMigrationResultType] = useState<"success" | "error" | null>(null);
  const migrationLogRef = useRef<HTMLPreElement>(null);

  // Backup / Import state
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Enhanced backup state
  const [backupInventory, setBackupInventory] = useState<any>(null);
  const [includeSessions, setIncludeSessions] = useState(true);
  const [includeKanban, setIncludeKanban] = useState(true);
  const [backupProgress, setBackupProgress] = useState<{
    phase: string;
    percent: number;
  } | null>(null);
  const [importManifest, setImportManifest] = useState<any>(null);
  const [importArchivePath, setImportArchivePath] = useState<string | null>(null);
  const [showImportPreview, setShowImportPreview] = useState(false);

  // Log viewer state
  const [logContent, setLogContent] = useState("");
  const [logFile, setLogFile] = useState("gateway.log");
  const [logPath, setLogPath] = useState("");
  const [logsExpanded, setLogsExpanded] = useState(false);

  // Network settings
  const [forceIpv4, setForceIpv4] = useState(false);
  const [httpProxy, setHttpProxy] = useState("");
  const [networkSaved, setNetworkSaved] = useState(false);

  // Debug dump
  const [dumpOutput, setDumpOutput] = useState<string | null>(null);
  const [dumpRunning, setDumpRunning] = useState(false);

  const terminalEndRef = useRef<HTMLPreElement>(null);

  const loadConfig = useCallback(async (): Promise<void> => {
    const [home, aVersion] = await Promise.all([
      window.omniworkerAPI.getOmniWorkerHome(profile),
      window.omniworkerAPI.getAppVersion(),
    ]);
    setOmniWorkerHome(home);
    setAppVersion(aVersion);

    window.omniworkerAPI.getConfig("network.force_ipv4", profile).then((v) => {
      setForceIpv4(v === "true" || v === "True");
    });
    window.omniworkerAPI.getConfig("network.proxy", profile).then((v) => {
      setHttpProxy(v || "");
    });

    window.omniworkerAPI.getOmniWorkerVersion().then((v) => {
      setOmniWorkerVersion(v);
      if (v) {
        try {
          localStorage.setItem("omniworker-version-cache", v);
        } catch {}
      }
    });

    if (localStorage.getItem("omniworker-omniworker-dismissed") !== "true") {
      window.omniworkerAPI.checkOmniWorker().then((claw) => {
        setOpenclawFound(claw.found);
        setOpenclawPath(claw.path);
        try {
          localStorage.setItem("omniworker-omniworker-cache", JSON.stringify(claw));
        } catch {}
      });
    }
  }, [profile]);

  useEffect(() => {
    void Promise.resolve().then(loadConfig);
  }, [loadConfig]);

  // Scroll to bottom of terminal when logs content updates
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollTop = terminalEndRef.current.scrollHeight;
    }
  }, [logContent]);

  // Live polling effect for logs
  useEffect(() => {
    if (!logsExpanded) return;
    
    loadLogs();
    const interval = setInterval(() => {
      loadLogs();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [logsExpanded, logFile]);

  async function handleMigrate(): Promise<void> {
    setMigrating(true);
    setMigrationLog("");
    setMigrationResult(null);

    const cleanup = window.omniworkerAPI.onInstallProgress((p) => {
      setMigrationLog(p.log);
    });

    try {
      const result = await window.omniworkerAPI.runClawMigrate();
      cleanup();
      if (result.success) {
        setMigrationResult(t("settings.migrationComplete"));
        setMigrationResultType("success");
        setOpenclawFound(false);
      } else {
        setMigrationResult(result.error || t("settings.migrationFailed"));
        setMigrationResultType("error");
      }
    } catch (err) {
      cleanup();
      setMigrationResult((err as Error).message || t("settings.migrationFailed"));
      setMigrationResultType("error");
    }
    setMigrating(false);
  }

  function handleDismissMigration(): void {
    localStorage.setItem("omniworker-omniworker-dismissed", "true");
    setMigrationDismissed(true);
  }

  async function handleBackup(): Promise<void> {
    if (!backupInventory) {
      const inv = await window.omniworkerAPI.scanBackupData(profile, {
        includeSessions,
        includeKanban,
      });
      setBackupInventory(inv);
      return;
    }

    setBackingUp(true);
    setBackupResult(null);
    setBackupProgress({ phase: "compressing", percent: 0 });

    const cleanup = window.omniworkerAPI.onBackupProgress((p: any) => {
      setBackupProgress({ phase: p.phase, percent: p.percent });
    });

    const result = await window.omniworkerAPI.createBackup(profile, {
      includeSessions,
      includeKanban,
    });
    cleanup();

    setBackingUp(false);
    setBackupProgress(null);
    if (result.success) {
      const sizeMB = result.size ? (result.size / 1024 / 1024).toFixed(1) : "?";
      setBackupResult(`Backup created (${sizeMB} MB): ${result.path || "success"}`);
      setBackupInventory(null);
    } else if (result.error !== "Cancelled") {
      setBackupResult(result.error || "Backup failed.");
    }
  }

  async function handleImport(): Promise<void> {
    if (showImportPreview && importArchivePath) {
      setImporting(true);
      setImportResult(null);
      setBackupProgress({ phase: "extracting", percent: 0 });

      const cleanup = window.omniworkerAPI.onBackupProgress((p: any) => {
        setBackupProgress({ phase: p.phase, percent: p.percent });
      });

      const result = await window.omniworkerAPI.restoreBackup(importArchivePath, profile, {
        includeSessions: true,
        includeKanban: true,
        overwrite: true,
      });
      cleanup();

      setImporting(false);
      setBackupProgress(null);
      if (result.success) {
        setImportResult(`Restored ${result.restoredItems.length} items successfully. App will refresh...`);
        setShowImportPreview(false);
        setImportManifest(null);
        setImportArchivePath(null);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setImportResult(result.error || "Import failed.");
      }
      return;
    }

    const result = await window.omniworkerAPI.readBackupManifest();
    if (result.error === "Cancelled") return;
    if (result.error) {
      setImportResult(result.error);
      return;
    }
    if (result.manifest) {
      setImportManifest(result.manifest);
      setImportArchivePath(result.path || null);
      setShowImportPreview(true);
    }
  }

  async function loadLogs(): Promise<void> {
    const result = await window.omniworkerAPI.readLogs(logFile, 300);
    setLogContent(result.content);
    setLogPath(result.path);
  }

  async function handleDoctor(): Promise<void> {
    setDoctorRunning(true);
    setDoctorOutput(null);
    const output = await window.omniworkerAPI.runOmniWorkerDoctor();
    setDoctorOutput(output);
    setDoctorRunning(false);
  }

  function refreshVersion(): void {
    window.omniworkerAPI.refreshOmniWorkerVersion().then((v) => {
      setOmniWorkerVersion(v);
      if (v) {
        try {
          localStorage.setItem("omniworker-version-cache", v);
        } catch {}
      }
    });
  }

  async function handleUpdateOmniWorker(): Promise<void> {
    setUpdating(true);
    setUpdateResult(null);
    const result = await window.omniworkerAPI.runOmniWorkerUpdate();
    setUpdating(false);
    if (result.success) {
      setUpdateResult(t("settings.updateSuccess"));
      setUpdateResultType("success");
      refreshVersion();
    } else {
      setUpdateResult(result.error || t("settings.updateFailed"));
      setUpdateResultType("error");
    }
  }

  const parsedVersion = (() => {
    if (!omniworkerVersion) return null;
    const v = omniworkerVersion;
    const version = v.match(/v([\d.]+)/)?.[1] || "";
    const date = v.match(/\(([\d.]+)\)/)?.[1] || "";
    const python = v.match(/Python:\s*([\d.]+)/)?.[1] || "";
    const sdk = v.match(/OpenAI SDK:\s*([\d.]+)/)?.[1] || "";
    const updateMatch = v.match(/Update available:\s*(.+?)(w*—|$)/);
    const updateInfo = updateMatch?.[1]?.trim() || null;
    return { version, date, python, sdk, updateInfo };
  })();

  const formatLogLines = (content: string) => {
    if (!content) return <span className="text-[var(--text-muted)] text-xs italic px-4 py-2 block">Terminal empty. No records found.</span>;
    return content.split("\n").map((line, idx) => {
      if (!line.trim() && idx === content.split("\n").length - 1) return null;
      let className = "text-[var(--text-primary)]";
      if (/error|failed|exception|critical/i.test(line)) {
        className = "text-[var(--neon-pink)] font-semibold";
      } else if (/success|ok|ready|200/i.test(line)) {
        className = "text-[var(--accent)]";
      } else if (/warning|warn/i.test(line)) {
        className = "text-[var(--warning)] font-medium";
      } else if (/info|debug/i.test(line)) {
        className = "text-[var(--text-muted)] opacity-80";
      }
      return (
        <div key={idx} className="hover:bg-[rgba(255,255,255,0.02)] px-4 py-0.5 rounded transition-colors flex gap-4 text-xs font-mono">
          <span className="text-[var(--text-muted)] select-none opacity-30 text-right w-8">{idx + 1}</span>
          <span className={className}>{line}</span>
        </div>
      );
    });
  };

  return (
    <div className="settings-container max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Scope Style Overrides */}
      <style>{`
        .cockpit-card {
          background: rgba(14, 14, 17, 0.45);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cockpit-card:hover {
          border-color: rgba(255, 255, 255, 0.15);
          box-shadow: 0 0 24px rgba(255, 255, 255, 0.02), 0 8px 32px 0 rgba(0, 0, 0, 0.35);
        }
        .theme-btn {
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .theme-btn.active {
          background: var(--accent);
          color: var(--accent-btn-text);
          border-color: var(--accent);
          box-shadow: 0 0 12px var(--accent-subtle);
          font-weight: 600;
        }
        .theme-btn:not(.active):hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
        }
        .futuristic-terminal {
          background: #09090b;
          border: 1px solid rgba(255, 255, 255, 0.04);
          box-shadow: inset 0 2px 10px rgba(0,0,0,0.8);
        }
        .custom-toggle input:checked ~ .toggle-track {
          background-color: var(--accent);
        }
        .custom-toggle input:checked ~ .toggle-track::after {
          transform: translateX(14px);
          background-color: var(--accent-btn-text);
        }
        .toggle-track {
          width: 32px;
          height: 18px;
          background-color: rgba(255,255,255,0.1);
          border-radius: 9px;
          position: relative;
          transition: background-color 0.2s;
          cursor: pointer;
        }
        .toggle-track::after {
          content: "";
          position: absolute;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background-color: #e4e1e6;
          top: 2px;
          left: 2px;
          transition: transform 0.2s, background-color 0.2s;
        }
      `}</style>

      {/* Header Panel */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)] flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] animate-pulse inline-block shadow-[0_0_10px_var(--accent)]"></span>
            SYSTEM SETTINGS COCKPIT
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">Audit, optimize, and customize the core AI agent runtime settings</p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] font-mono">
          <Activity size={12} className="text-[var(--accent)] animate-pulse" />
          <span>PORT: 8341 [ROUTER]</span>
        </div>
      </div>

      {/* Migration Banner (if found) */}
      {omniworkerFound && !migrationDismissed && (
        <div className="p-4 bg-[var(--accent-subtle)] border border-[var(--accent)]/30 rounded-xl flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="text-[var(--accent)] flex-shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-sm font-bold text-[var(--accent-text)]">{t("settings.migrationDetected")}</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: t("settings.migrationDesc", { path: omniworkerPath || "" }) }} />
              </div>
            </div>
            <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-lg" onClick={handleDismissMigration}>
              &times;
            </button>
          </div>
          {migrationLog && (
            <pre className="p-3 rounded-lg bg-black/60 border border-[var(--border)] text-[10px] text-[var(--text-secondary)] max-h-40 overflow-y-auto font-mono" ref={migrationLogRef}>
              {migrationLog}
            </pre>
          )}
          {migrationResult && (
            <div className={`text-xs px-3 py-2 rounded-lg font-semibold ${migrationResultType === "success" ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--error-bg)] text-[var(--error)]"}`}>
              {migrationResult}
            </div>
          )}
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0e0e11] text-xs font-semibold transition-all" onClick={handleMigrate} disabled={migrating}>
              {migrating ? t("settings.migrating") : t("settings.migrateToOmniWorker")}
            </button>
            <button className="px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[rgba(255,255,255,0.02)] text-[var(--text-primary)] text-xs font-semibold transition-all" onClick={handleDismissMigration}>
              {t("settings.skip")}
            </button>
          </div>
        </div>
      )}

      {/* 2x2 Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 1: Core Engine Diagnostics */}
        <div className="cockpit-card p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border)]">
              <Cpu size={16} className="text-[var(--accent)]" />
              <h3 className="text-xs font-black tracking-wider uppercase text-[var(--text-muted)]">{t("settings.sections.omniworkerAgent")}</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">{t("common.engine")}</span>
                {omniworkerVersion === null ? (
                  <div className="h-4 bg-[var(--bg-hover)] animate-pulse rounded w-16" />
                ) : (
                  <span className="text-xs font-bold font-mono text-[var(--text-primary)]">
                    {parsedVersion ? `v${parsedVersion.version}` : t("settings.notDetected")}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">{t("common.released")}</span>
                {omniworkerVersion === null ? (
                  <div className="h-4 bg-[var(--bg-hover)] animate-pulse rounded w-20" />
                ) : (
                  <span className="text-xs font-medium font-mono text-[var(--text-secondary)]">{parsedVersion?.date || "—"}</span>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">{t("common.desktop")}</span>
                {!appVersion ? (
                  <div className="h-4 bg-[var(--bg-hover)] animate-pulse rounded w-12" />
                ) : (
                  <span className="text-xs font-medium font-mono text-[var(--text-secondary)]">v{appVersion}</span>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">Python</span>
                {omniworkerVersion === null ? (
                  <div className="h-4 bg-[var(--bg-hover)] animate-pulse rounded w-16" />
                ) : (
                  <span className="text-xs font-medium font-mono text-[var(--text-secondary)]">{parsedVersion?.python || "—"}</span>
                )}
              </div>
            </div>

            <div className="space-y-1 pt-1 border-t border-[var(--border)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block font-semibold">{t("common.home")}</span>
              {!omniworkerHome ? (
                <div className="h-4 bg-[var(--bg-hover)] animate-pulse rounded w-full" />
              ) : (
                <span className="text-[11px] font-mono text-[var(--text-muted)] break-all">{omniworkerHome}</span>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-6">
            {parsedVersion?.updateInfo && (
              <div className="text-[11px] text-[var(--accent-text)] bg-[var(--accent-subtle)] px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/10 font-medium">
                {parsedVersion.updateInfo}
              </div>
            )}
            
            <div className="flex flex-wrap gap-2">
              {parsedVersion?.updateInfo ? (
                <button className="px-3 py-1.5 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0e0e11] text-xs font-semibold transition-all flex items-center gap-1.5" onClick={handleUpdateOmniWorker} disabled={updating}>
                  <RefreshCw size={12} className={updating ? "animate-spin" : ""} />
                  {updating ? t("settings.updating") : t("settings.updateEngine")}
                </button>
              ) : (
                <button className="px-3 py-1.5 rounded bg-white/5 text-[var(--text-muted)] border border-white/5 text-xs font-semibold cursor-not-allowed" disabled>
                  {t("settings.latestVersion")}
                </button>
              )}
              <button className="px-3 py-1.5 rounded border border-[var(--border)] hover:bg-white/5 text-[var(--text-primary)] text-xs font-semibold transition-all" onClick={handleDoctor} disabled={doctorRunning}>
                {doctorRunning ? t("settings.runningDiagnosis") : t("settings.runDiagnosis")}
              </button>
              <button className="px-3 py-1.5 rounded border border-[var(--border)] hover:bg-white/5 text-[var(--text-primary)] text-xs font-semibold transition-all" onClick={async () => {
                setDumpRunning(true);
                setDumpOutput(null);
                const output = await window.omniworkerAPI.runOmniWorkerDump();
                setDumpOutput(output);
                setDumpRunning(false);
              }} disabled={dumpRunning}>
                {dumpRunning ? t("settings.running") : t("settings.debugDump")}
              </button>
            </div>
            
            {updateResult && (
              <div className={`text-xs px-3 py-2 rounded-lg ${updateResultType === "success" ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--error-bg)] text-[var(--error)]"}`}>
                {updateResult}
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Environment Appearance */}
        <div className="cockpit-card p-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border)]">
              <Palette size={16} className="text-[var(--accent)]" />
              <h3 className="text-xs font-black tracking-wider uppercase text-[var(--text-muted)]">{t("settings.sections.appearance")}</h3>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] block">{t("settings.theme.label")}</label>
              <div className="grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`theme-btn py-2 px-3 rounded-lg text-xs transition-all ${theme === opt.value ? "active" : ""}`}
                    onClick={() => setTheme(opt.value)}
                  >
                    {opt.value === "system"
                      ? t("settings.theme.system")
                      : opt.value === "light"
                        ? t("settings.theme.light")
                        : t("settings.theme.dark")}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">{t("settings.appearanceHint")}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] block">{t("settings.language.label")}</label>
              <LanguageSelect locale={locale} onSelect={setLocale} />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">{t("settings.language.hint")}</p>
            </div>
          </div>
          <div className="h-6" /> {/* Spacer alignment */}
        </div>

        {/* Card 3: Intelligent Network */}
        <div className="cockpit-card p-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border)]">
              <Network size={16} className="text-[var(--accent)]" />
              <h3 className="text-xs font-black tracking-wider uppercase text-[var(--text-muted)]">{t("settings.networkSection")}</h3>
            </div>

            <div className="flex items-start justify-between bg-white/[0.01] p-3 rounded-lg border border-[var(--border)]">
              <div className="space-y-1 pr-4">
                <span className="text-xs font-semibold text-[var(--text-primary)] block">{t("settings.forceIpv4")}</span>
                <span className="text-[11px] text-[var(--text-muted)] leading-relaxed block">{t("settings.forceIpv4Hint")}</span>
              </div>
              <label className="custom-toggle inline-flex items-center flex-shrink-0 mt-1 select-none">
                <input
                  type="checkbox"
                  className="hidden"
                  checked={forceIpv4}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setForceIpv4(val);
                    await window.omniworkerAPI.setConfig("network.force_ipv4", val ? "true" : "false", profile);
                    setNetworkSaved(true);
                    setTimeout(() => setNetworkSaved(false), 2000);
                  }}
                />
                <span className="toggle-track" />
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-secondary)] block">{t("settings.httpProxy")}</label>
              <input
                className="w-full bg-black/40 border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] placeholder-[#555] transition-colors"
                type="text"
                value={httpProxy}
                onChange={(e) => setHttpProxy(e.target.value)}
                onBlur={async () => {
                  await window.omniworkerAPI.setConfig("network.proxy", httpProxy.trim(), profile);
                  setNetworkSaved(true);
                  setTimeout(() => setNetworkSaved(false), 2000);
                }}
                placeholder={t("settings.proxyPlaceholder")}
              />
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{t("settings.httpProxyHint")}</p>
            </div>
          </div>

          <div className="pt-4 flex justify-between items-center">
            {networkSaved ? (
              <span className="text-xs text-[var(--accent)] font-semibold flex items-center gap-1">
                <Check size={12} />
                {t("settings.saved")}
              </span>
            ) : <span />}
          </div>
        </div>

        {/* Card 4: Backup, Data & Redundancy */}
        <div className="cockpit-card p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border)]">
              <ShieldCheck size={16} className="text-[var(--accent)]" />
              <h3 className="text-xs font-black tracking-wider uppercase text-[var(--text-muted)]">{t("settings.dataSection")}</h3>
            </div>
            
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{t("settings.dataHint")}</p>

            <div className="grid grid-cols-2 gap-4">
              {/* Export Panel */}
              <div className="p-3.5 rounded-lg bg-white/[0.01] border border-[var(--border)] space-y-3">
                <span className="text-xs font-bold text-[var(--text-primary)] block">Export Backup</span>
                
                {backupInventory && (
                  <div className="space-y-2 text-[10px] text-[var(--text-muted)]">
                    <div>
                      {backupInventory.files.filter((f: any) => f.exists).length} files &middot; {(backupInventory.totalSize / 1024).toFixed(0)} KB
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={includeSessions} onChange={(e) => { setIncludeSessions(e.target.checked); setBackupInventory(null); }} />
                      <span>Include chat history ({backupInventory.sessionCount})</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={includeKanban} onChange={(e) => { setIncludeKanban(e.target.checked); setBackupInventory(null); }} />
                      <span>Include kanban tasks ({backupInventory.kanbanTaskCount})</span>
                    </label>
                  </div>
                )}

                {backupProgress && !importing && (
                  <div className="space-y-1">
                    <div className="h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${backupProgress.percent}%` }} />
                    </div>
                    <div className="text-[9px] text-[var(--text-muted)]">{backupProgress.phase}...</div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-xs font-semibold text-[var(--text-primary)] transition-all flex items-center gap-1.5" onClick={handleBackup} disabled={backingUp}>
                    <Download size={11} />
                    {backingUp ? "Exporting..." : backupInventory ? "Save..." : "Export"}
                  </button>
                  {backupInventory && !backingUp && (
                    <button className="px-2 py-1 rounded bg-black/40 border border-[var(--border)] text-[9px] text-[var(--text-muted)] hover:text-white" onClick={() => setBackupInventory(null)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Import Panel */}
              <div className="p-3.5 rounded-lg bg-white/[0.01] border border-[var(--border)] space-y-3">
                <span className="text-xs font-bold text-[var(--text-primary)] block">Import Backup</span>
                
                {showImportPreview && importManifest && (
                  <div className="space-y-1.5 text-[10px] text-[var(--text-muted)]">
                    <div className="text-[9px] text-[var(--accent-text)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded inline-block">Manifest Loaded</div>
                    <div className="font-semibold text-white">Overwrite local database. App will refresh.</div>
                  </div>
                )}

                {backupProgress && importing && (
                  <div className="space-y-1">
                    <div className="h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--warning)] transition-all duration-300" style={{ width: `${backupProgress.percent}%` }} />
                    </div>
                    <div className="text-[9px] text-[var(--text-muted)]">{backupProgress.phase}...</div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button className="px-2.5 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-xs font-semibold text-[var(--text-primary)] transition-all flex items-center gap-1.5" onClick={handleImport} disabled={importing}>
                    <Upload size={11} />
                    {importing ? "Restoring..." : showImportPreview ? "Confirm" : "Import"}
                  </button>
                  {showImportPreview && !importing && (
                    <button className="px-2 py-1 rounded bg-black/40 border border-[var(--border)] text-[9px] text-[var(--text-muted)] hover:text-white" onClick={() => {
                      setShowImportPreview(false);
                      setImportManifest(null);
                      setImportArchivePath(null);
                    }}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3">
            {backupResult && (
              <div className={`text-[11px] px-2.5 py-1.5 rounded-lg ${backupResult.includes("success") || backupResult.includes("created") ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--error-bg)] text-[var(--error)]"}`}>
                {backupResult}
              </div>
            )}
            {importResult && (
              <div className={`text-[11px] px-2.5 py-1.5 rounded-lg ${importResult.includes("success") || importResult.includes("Restored") ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--error-bg)] text-[var(--error)]"}`}>
                {importResult}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Real-time Diagnostic Diagnostic Outputs (Doctor, Dump) */}
      {(doctorOutput || dumpOutput) && (
        <div className="cockpit-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
            <span className="text-xs font-black tracking-wider uppercase text-[var(--text-muted)]">Command Outputs</span>
            <button className="text-[11px] text-[var(--accent-text)] hover:underline" onClick={() => { setDoctorOutput(null); setDumpOutput(null); }}>Clear Console</button>
          </div>
          <pre className="p-4 rounded-lg bg-black/60 border border-[var(--border)] text-xs text-[var(--text-secondary)] font-mono max-h-60 overflow-y-auto whitespace-pre-wrap select-text">
            {doctorOutput || dumpOutput}
          </pre>
        </div>
      )}

      {/* Full-width Card 5: Real-time Log Streams */}
      <div className="cockpit-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => {
            const next = !logsExpanded;
            setLogsExpanded(next);
            if (next) loadLogs();
          }}>
            <Terminal size={16} className="text-[var(--accent)]" />
            <span className="text-xs font-black tracking-wider uppercase text-[var(--text-muted)]">
              {t("settings.logsSection")}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[var(--text-muted)] font-mono">
              {logsExpanded ? "LIVE POLLING [3S]" : "STANDBY"}
            </span>
          </div>
          <button 
            onClick={() => {
              const next = !logsExpanded;
              setLogsExpanded(next);
              if (next) loadLogs();
            }}
            className="text-[11px] text-[var(--accent-text)] font-semibold bg-[var(--accent-subtle)] border border-[var(--accent)]/10 px-2.5 py-1 rounded hover:bg-[var(--accent)]/10 transition-colors"
          >
            {logsExpanded ? "Collapse Stream Console" : "Open Stream Console"}
          </button>
        </div>

        {logsExpanded && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-secondary)]/50 p-2 rounded-lg border border-[var(--border)]">
              <div className="flex gap-2">
                {["gateway.log", "agent.log", "errors.log"].map((f) => (
                  <button
                    key={f}
                    className={`px-3 py-1 rounded text-xs font-mono transition-all ${logFile === f ? "bg-[var(--accent)] text-[#0e0e11] font-semibold shadow-[0_0_10px_rgba(212,255,0,0.15)]" : "bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] border border-white/5"}`}
                    onClick={() => {
                      setLogFile(f);
                      window.omniworkerAPI.readLogs(f, 300).then((r) => {
                        setLogContent(r.content);
                        setLogPath(r.path);
                      });
                    }}
                  >
                    {f.replace(".log", "").toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {logPath && (
                  <span className="text-[10px] font-mono text-[var(--text-muted)] truncate max-w-sm hidden sm:inline">
                    FILE: {logPath}
                  </span>
                )}
                <button className="px-2.5 py-1 rounded bg-white/5 border border-white/5 text-[11px] text-[var(--text-primary)] hover:bg-white/10 transition-all flex items-center gap-1" onClick={loadLogs}>
                  <RefreshCw size={10} />
                  {t("settings.refresh")}
                </button>
              </div>
            </div>

            {/* Futuristic Scrolling Terminal */}
            <pre
              ref={terminalEndRef}
              className="futuristic-terminal rounded-xl py-3 border border-[var(--border)] overflow-y-auto max-h-72 min-h-40 scroll-smooth select-text"
              style={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineHeight: "1.5",
              }}
            >
              {formatLogLines(logContent)}
            </pre>
          </div>
        )}
      </div>

    </div>
  );
}

function LanguageSelect({
  locale,
  onSelect,
}: {
  locale: AppLocale;
  onSelect: (l: AppLocale) => void;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block w-full" ref={ref}>
      <button
        type="button"
        className="w-full bg-black/40 border border-[var(--border)] rounded-lg px-4 py-2.5 text-xs text-left text-[var(--text-primary)] flex items-center justify-between hover:border-white/10 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="font-semibold">{LANGUAGE_NATIVE_NAMES[locale]}</span>
        <ChevronDown size={14} className="text-[var(--text-muted)]" />
      </button>
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-[#18181b] border border-[var(--border)] rounded-lg shadow-xl z-50 overflow-hidden" role="listbox">
          {APP_LOCALES.map((l) => {
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                role="option"
                aria-selected={active}
                className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors ${active ? "bg-[var(--accent)] text-[#0e0e11] font-semibold" : "text-[var(--text-secondary)] hover:bg-white/5"}`}
                onClick={() => {
                  onSelect(l);
                  setIsOpen(false);
                }}
              >
                <span>{LANGUAGE_NATIVE_NAMES[l]}</span>
                {active && <Check size={12} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Settings;
