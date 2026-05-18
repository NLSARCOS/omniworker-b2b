import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "../../components/ThemeProvider";
import { THEME_OPTIONS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import { APP_LOCALES, type AppLocale } from "../../../../shared/i18n";
import { Check, ChevronDown, Download, Upload, FileText } from "lucide-react";

const LANGUAGE_NATIVE_NAMES: Record<AppLocale, string> = {
  en: "English",
  es: "Español",
  id: "Bahasa Indonesia",
  ja: "日本語",
  "pt-BR": "Português",
  "zh-CN": "中文",
};

// Read cached values from localStorage for instant display
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

  // OmniWorker engine info — initialize from localStorage cache for instant display
  const [omniworkerVersion, setOmniWorkerVersion] = useState<string | null>(
    getCachedVersion,
  );
  const [appVersion, setAppVersion] = useState("");
  const [doctorOutput, setDoctorOutput] = useState<string | null>(null);
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  const [updateResultType, setUpdateResultType] = useState<
    "success" | "error" | null
  >(null);

  // OmniWorker migration — initialize from localStorage cache
  const cachedClaw = getCachedOmniWorker();
  const [omniworkerFound, setOpenclawFound] = useState(
    cachedClaw?.found ?? false,
  );
  const [omniworkerPath, setOpenclawPath] = useState<string | null>(
    cachedClaw?.path ?? null,
  );
  const [migrationDismissed, setMigrationDismissed] = useState(
    () => localStorage.getItem("omniworker-omniworker-dismissed") === "true",
  );
  const [migrating, setMigrating] = useState(false);
  const [migrationLog, setMigrationLog] = useState("");
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  const [migrationResultType, setMigrationResultType] = useState<
    "success" | "error" | null
  >(null);
  const migrationLogRef = useRef<HTMLPreElement>(null);

  // Connection mode
  const [connMode, setConnMode] = useState<"local" | "remote" | "ssh">("local");
  const [connRemoteUrl, setConnRemoteUrl] = useState("");
  const [connApiKey, setConnApiKey] = useState("");
  const [connTesting, setConnTesting] = useState(false);
  const [connStatus, setConnStatus] = useState<string | null>(null);
  const connLoaded = useRef(false);

  // SSH connection state
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [sshRemotePort, setSshRemotePort] = useState("");

  // Backup / Import state
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Enhanced backup state
  const [backupInventory, setBackupInventory] = useState<any>(null);
  const [includeSessions, setIncludeSessions] = useState(false);
  const [includeKanban, setIncludeKanban] = useState(false);
  const [backupProgress, setBackupProgress] = useState<{
    phase: string;
    percent: number;
  } | null>(null);
  const [importManifest, setImportManifest] = useState<any>(null);
  const [importArchivePath, setImportArchivePath] = useState<string | null>(
    null,
  );
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

  const loadConfig = useCallback(async (): Promise<void> => {
    // Load fast config first (cached in main process)
    const [home, aVersion, conn] = await Promise.all([
      window.omniworkerAPI.getOmniWorkerHome(profile),
      window.omniworkerAPI.getAppVersion(),
      window.omniworkerAPI.getConnectionConfig(),
    ]);
    setOmniWorkerHome(home);
    setAppVersion(aVersion);
    setConnMode(conn.mode);
    setConnRemoteUrl(conn.remoteUrl);
    setConnApiKey(conn.apiKey);
    setSshHost(conn.ssh?.host || "");
    setSshPort(conn.ssh?.port ? String(conn.ssh.port) : "");
    setSshUser(conn.ssh?.username || "");
    setSshKeyPath(conn.ssh?.keyPath || "");
    setSshRemotePort(conn.ssh?.remotePort ? String(conn.ssh.remotePort) : "");
    connLoaded.current = true;

    // Load network settings from config.yaml
    window.omniworkerAPI.getConfig("network.force_ipv4", profile).then((v) => {
      setForceIpv4(v === "true" || v === "True");
    });
    window.omniworkerAPI.getConfig("network.proxy", profile).then((v) => {
      setHttpProxy(v || "");
    });

    // Defer slow calls — background refresh, cached values show instantly
    window.omniworkerAPI.getOmniWorkerVersion().then((v) => {
      setOmniWorkerVersion(v);
      if (v) {
        try {
          localStorage.setItem("omniworker-version-cache", v);
        } catch {
          /* ignore */
        }
      }
    });

    if (localStorage.getItem("omniworker-omniworker-dismissed") !== "true") {
      window.omniworkerAPI.checkOmniWorker().then((claw) => {
        setOpenclawFound(claw.found);
        setOpenclawPath(claw.path);
        try {
          localStorage.setItem(
            "omniworker-omniworker-cache",
            JSON.stringify(claw),
          );
        } catch {
          /* ignore */
        }
      });
    }
  }, [profile]);

  useEffect(() => {
    void Promise.resolve().then(loadConfig);
  }, [loadConfig]);

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
      setMigrationResult(
        (err as Error).message || t("settings.migrationFailed"),
      );
      setMigrationResultType("error");
    }
    setMigrating(false);
  }

  function handleDismissMigration(): void {
    localStorage.setItem("omniworker-omniworker-dismissed", "true");
    setMigrationDismissed(true);
  }

  async function handleSaveConnection(): Promise<void> {
    if (connMode === "ssh") {
      await window.omniworkerAPI.setSshConfig(
        sshHost.trim(),
        parseInt(sshPort, 10) || 22,
        sshUser.trim(),
        sshKeyPath.trim(),
        parseInt(sshRemotePort, 10) || 8642,
        18642,
      );
    } else {
      await window.omniworkerAPI.setConnectionConfig(
        connMode,
        connRemoteUrl,
        connApiKey,
      );
    }
    setConnStatus("Saved");
    setTimeout(() => setConnStatus(null), 2000);
  }

  async function handleTestConnection(): Promise<void> {
    if (connMode === "ssh") {
      if (!sshHost.trim() || !sshUser.trim()) {
        setConnStatus("Host and username are required");
        return;
      }
      setConnTesting(true);
      setConnStatus(null);
      const ok = await window.omniworkerAPI.testSshConnection(
        sshHost.trim(),
        parseInt(sshPort, 10) || 22,
        sshUser.trim(),
        sshKeyPath.trim(),
        parseInt(sshRemotePort, 10) || 8642,
      );
      setConnTesting(false);
      setConnStatus(ok ? "SSH tunnel connected!" : "Could not connect via SSH");
    } else {
      const url = connRemoteUrl.trim();
      if (!url) {
        setConnStatus("Please enter a URL");
        return;
      }
      setConnTesting(true);
      setConnStatus(null);
      const ok = await window.omniworkerAPI.testRemoteConnection(
        url,
        connApiKey.trim(),
      );
      setConnTesting(false);
      setConnStatus(ok ? "Connected successfully!" : "Could not reach server");
    }
  }

  async function handleSwitchToLocal(): Promise<void> {
    setConnMode("local");
    setConnRemoteUrl("");
    setConnApiKey("");
    await window.omniworkerAPI.setConnectionConfig("local", "", "");
    setConnStatus(t("settings.switchedToLocal"));
    setTimeout(() => setConnStatus(null), 2000);
  }

  async function handleBackup(): Promise<void> {
    // Scan first to show what will be backed up
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
      setBackupResult(
        `Backup created (${sizeMB} MB): ${result.path || "success"}`,
      );
      setBackupInventory(null);
    } else if (result.error !== "Cancelled") {
      setBackupResult(result.error || "Backup failed.");
    }
  }

  async function handleImport(): Promise<void> {
    if (showImportPreview && importArchivePath) {
      // Restore
      setImporting(true);
      setImportResult(null);
      setBackupProgress({ phase: "extracting", percent: 0 });

      const cleanup = window.omniworkerAPI.onBackupProgress((p: any) => {
        setBackupProgress({ phase: p.phase, percent: p.percent });
      });

      const result = await window.omniworkerAPI.restoreBackup(
        importArchivePath,
        profile,
        {
          includeSessions: true,
          includeKanban: true,
          overwrite: true,
        },
      );
      cleanup();

      setImporting(false);
      setBackupProgress(null);
      if (result.success) {
        setImportResult(
          `Restored ${result.restoredItems.length} items successfully. App will refresh...`,
        );
        setShowImportPreview(false);
        setImportManifest(null);
        setImportArchivePath(null);
        // Refresh app state
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setImportResult(result.error || "Import failed.");
      }
      return;
    }

    // Open file picker and read manifest
    const result = await window.omniworkerAPI.readBackupManifest();
    if (result.error === "Cancelled") return;
    if (result.error) {
      setImportResult(result.error);
      return;
    }
    if (result.manifest) {
      setImportManifest(result.manifest);
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

  // Helper to fetch fresh version, clear backend cache, and update localStorage
  function refreshVersion(): void {
    window.omniworkerAPI.refreshOmniWorkerVersion().then((v) => {
      setOmniWorkerVersion(v);
      if (v) {
        try {
          localStorage.setItem("omniworker-version-cache", v);
        } catch {
          /* ignore */
        }
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

  // Parse "OmniWorker Agent v0.7.0 (2026.4.3) Project: ... Python: 3.11.15 OpenAI SDK: 2.30.0 Update available: ..."
  const parsedVersion = (() => {
    if (!omniworkerVersion) return null;
    const v = omniworkerVersion;
    const version = v.match(/v([\d.]+)/)?.[1] || "";
    const date = v.match(/\(([\d.]+)\)/)?.[1] || "";
    const python = v.match(/Python:\s*([\d.]+)/)?.[1] || "";
    const sdk = v.match(/OpenAI SDK:\s*([\d.]+)/)?.[1] || "";
    const updateMatch = v.match(/Update available:\s*(.+?)(?:\s*—|$)/);
    const updateInfo = updateMatch?.[1]?.trim() || null;
    return { version, date, python, sdk, updateInfo };
  })();

  return (
    <div className="settings-container">
      <h1 className="settings-header">{t("settings.title")}</h1>

      <div className="settings-section">
        <div className="settings-section-title">
          {t("settings.sections.omniworkerAgent")}
        </div>
        <div className="settings-omniworker-info">
          <div className="settings-omniworker-row">
            <div className="settings-omniworker-detail">
              <span className="settings-omniworker-label">
                {t("common.engine")}
              </span>
              {omniworkerVersion === null ? (
                <span className="skeleton skeleton-sm" />
              ) : (
                <span className="settings-omniworker-value">
                  {parsedVersion
                    ? `v${parsedVersion.version}`
                    : t("settings.notDetected")}
                </span>
              )}
            </div>
            <div className="settings-omniworker-detail">
              <span className="settings-omniworker-label">
                {t("common.released")}
              </span>
              {omniworkerVersion === null ? (
                <span className="skeleton skeleton-sm" />
              ) : (
                <span className="settings-omniworker-value">
                  {parsedVersion?.date || "—"}
                </span>
              )}
            </div>
            <div className="settings-omniworker-detail">
              <span className="settings-omniworker-label">
                {t("common.desktop")}
              </span>
              {!appVersion ? (
                <span className="skeleton skeleton-sm" />
              ) : (
                <span className="settings-omniworker-value">
                  {t("settings.version", { version: appVersion })}
                </span>
              )}
            </div>
            <div className="settings-omniworker-detail">
              <span className="settings-omniworker-label">Python</span>
              {omniworkerVersion === null ? (
                <span className="skeleton skeleton-sm" />
              ) : (
                <span className="settings-omniworker-value">
                  {parsedVersion?.python || "—"}
                </span>
              )}
            </div>
            <div className="settings-omniworker-detail">
              <span className="settings-omniworker-label">OpenAI SDK</span>
              {omniworkerVersion === null ? (
                <span className="skeleton skeleton-sm" />
              ) : (
                <span className="settings-omniworker-value">
                  {parsedVersion?.sdk || "—"}
                </span>
              )}
            </div>
            <div className="settings-omniworker-detail">
              <span className="settings-omniworker-label">
                {t("common.home")}
              </span>
              {!omniworkerHome ? (
                <span className="skeleton skeleton-md" />
              ) : (
                <span className="settings-omniworker-value settings-omniworker-path">
                  {omniworkerHome}
                </span>
              )}
            </div>
          </div>
          {parsedVersion?.updateInfo && (
            <div className="settings-omniworker-update-badge">
              {parsedVersion.updateInfo}
            </div>
          )}
          <div className="settings-omniworker-actions">
            {parsedVersion?.updateInfo ? (
              <button
                className="btn btn-primary "
                onClick={handleUpdateOmniWorker}
                disabled={updating}
              >
                {updating ? t("settings.updating") : t("settings.updateEngine")}
              </button>
            ) : (
              <button className="btn btn-secondary" disabled>
                {t("settings.latestVersion")}
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={handleDoctor}
              disabled={doctorRunning}
            >
              {doctorRunning
                ? t("settings.runningDiagnosis")
                : t("settings.runDiagnosis")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={async () => {
                setDumpRunning(true);
                setDumpOutput(null);
                const output = await window.omniworkerAPI.runOmniWorkerDump();
                setDumpOutput(output);
                setDumpRunning(false);
              }}
              disabled={dumpRunning}
            >
              {dumpRunning ? t("settings.running") : t("settings.debugDump")}
            </button>
          </div>
          {updateResult && (
            <div
              className={`settings-omniworker-result ${updateResultType || "error"}`}
            >
              {updateResult}
            </div>
          )}
          {doctorOutput && (
            <pre className="settings-omniworker-doctor">{doctorOutput}</pre>
          )}
          {dumpOutput && (
            <pre className="settings-omniworker-doctor">{dumpOutput}</pre>
          )}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          {t("settings.connectionSection")}
          {connStatus && (
            <span className="settings-saved" style={{ marginLeft: 8 }}>
              {connStatus}
            </span>
          )}
        </div>

        <div className="settings-field">
          <label className="settings-field-label">
            {t("settings.connectionMode")}
          </label>
          <div className="settings-theme-options">
            <button
              className={`settings-theme-option ${connMode === "local" ? "active" : ""}`}
              onClick={() => {
                setConnMode("local");
                if (connLoaded.current) handleSwitchToLocal();
              }}
            >
              {t("settings.modeLocal")}
            </button>
            <button
              className={`settings-theme-option ${connMode === "remote" ? "active" : ""}`}
              onClick={() => setConnMode("remote")}
            >
              {t("settings.modeRemote")}
            </button>
            <button
              className={`settings-theme-option ${connMode === "ssh" ? "active" : ""}`}
              onClick={() => setConnMode("ssh")}
            >
              SSH Tunnel
            </button>
          </div>
          <div className="settings-field-hint">
            {connMode === "local"
              ? t("settings.modeLocalHint")
              : connMode === "ssh"
                ? "Tunnel to a remote OmniWorker over SSH — no exposed ports or API keys needed."
                : t("settings.modeRemoteHint")}
          </div>
        </div>

        {connMode === "remote" && (
          <>
            <div className="settings-field">
              <label className="settings-field-label">
                {t("settings.remoteUrl")}
              </label>
              <input
                className="input"
                type="url"
                value={connRemoteUrl}
                onChange={(e) => setConnRemoteUrl(e.target.value)}
                placeholder="http://192.168.1.100:8642"
                onBlur={handleSaveConnection}
              />
              <div className="settings-field-hint">
                {t("settings.remoteUrlHint")}
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">
                {t("settings.remoteApiKey")}
              </label>
              <input
                className="input"
                type="password"
                value={connApiKey}
                onChange={(e) => setConnApiKey(e.target.value)}
                placeholder={t("settings.remoteApiKey")}
                onBlur={handleSaveConnection}
              />
              <div className="settings-field-hint">
                {t("settings.remoteApiKeyHint")}
              </div>
            </div>
            <div className="settings-omniworker-actions">
              <button
                className="btn btn-secondary"
                onClick={handleTestConnection}
                disabled={connTesting}
              >
                {connTesting
                  ? t("settings.testingConnection")
                  : t("settings.testConnection")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveConnection}
              >
                {t("settings.save")}
              </button>
            </div>
          </>
        )}

        {connMode === "ssh" && (
          <>
            <div className="settings-field">
              <label className="settings-field-label">SSH Host</label>
              <input
                className="input"
                type="text"
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="192.168.1.100 or myserver.local"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">SSH Port</label>
              <input
                className="input"
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
                placeholder="22"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Username</label>
              <input
                className="input"
                type="text"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                placeholder="omniworker"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">
                Private Key Path{" "}
                <span style={{ fontWeight: 400, opacity: 0.6 }}>
                  (optional, defaults to ~/.ssh/id_rsa)
                </span>
              </label>
              <input
                className="input"
                type="text"
                value={sshKeyPath}
                onChange={(e) => setSshKeyPath(e.target.value)}
                placeholder="~/.ssh/id_rsa"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">
                Remote OmniWorker Port{" "}
                <span style={{ fontWeight: 400, opacity: 0.6 }}>
                  (default 8642)
                </span>
              </label>
              <input
                className="input"
                type="number"
                value={sshRemotePort}
                onChange={(e) => setSshRemotePort(e.target.value)}
                placeholder="8642"
              />
              <div className="settings-field-hint">
                Make sure you can run{" "}
                <code style={{ fontFamily: "monospace" }}>
                  ssh {sshUser || "user"}@{sshHost || "host"}
                </code>{" "}
                without a password prompt. The first connection trusts the host
                key and stores it in{" "}
                <code style={{ fontFamily: "monospace" }}>
                  ~/.ssh/known_hosts
                </code>
                ; SSH will fail closed if that key changes later.
              </div>
            </div>
            <div className="settings-omniworker-actions">
              <button
                className="btn btn-secondary"
                onClick={handleTestConnection}
                disabled={connTesting}
              >
                {connTesting ? "Testing SSH…" : "Test SSH Connection"}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveConnection}
              >
                {t("settings.save")}
              </button>
            </div>
          </>
        )}
      </div>

      {omniworkerFound && !migrationDismissed && (
        <div className="settings-migration-banner">
          <div className="settings-migration-header">
            <div>
              <div className="settings-migration-title">
                {t("settings.migrationDetected")}
              </div>
              <div
                className="settings-migration-desc"
                dangerouslySetInnerHTML={{
                  __html: t("settings.migrationDesc", {
                    path: omniworkerPath || "",
                  }),
                }}
              />
            </div>
            <button
              className="btn-ghost settings-migration-dismiss"
              onClick={handleDismissMigration}
              title={t("settings.migrationDismiss")}
            >
              &times;
            </button>
          </div>
          {migrationLog && (
            <pre className="settings-omniworker-doctor" ref={migrationLogRef}>
              {migrationLog}
            </pre>
          )}
          {migrationResult && (
            <div
              className={`settings-omniworker-result ${migrationResultType || "error"}`}
            >
              {migrationResult}
            </div>
          )}
          <div className="settings-migration-actions">
            <button
              className="btn btn-primary "
              onClick={handleMigrate}
              disabled={migrating}
            >
              {migrating
                ? t("settings.migrating")
                : t("settings.migrateToOmniWorker")}
            </button>
            <button
              className="btn btn-secondary "
              onClick={handleDismissMigration}
            >
              {t("settings.skip")}
            </button>
          </div>
        </div>
      )}

      <div className="settings-section">
        <div className="settings-section-title">
          {t("settings.sections.appearance")}
        </div>
        <div className="settings-field">
          <label className="settings-field-label">
            {t("settings.theme.label")}
          </label>
          <div className="settings-theme-options">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`settings-theme-option ${theme === opt.value ? "active" : ""}`}
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
          <div className="settings-field-hint">
            {t("settings.appearanceHint")}
          </div>
        </div>
        <div className="settings-field">
          <label className="settings-field-label">
            {t("settings.language.label")}
          </label>
          <LanguageSelect locale={locale} onSelect={setLocale} />
          <div className="settings-field-hint">
            {t("settings.language.hint")}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          {t("settings.networkSection")}
          {networkSaved && (
            <span className="settings-saved" style={{ marginLeft: 8 }}>
              {t("settings.saved")}
            </span>
          )}
        </div>
        <div className="settings-field">
          <label className="settings-field-label">
            {t("settings.forceIpv4")}
            <label
              className="tools-toggle"
              style={{ marginLeft: 12, verticalAlign: "middle" }}
            >
              <input
                type="checkbox"
                checked={forceIpv4}
                onChange={async (e) => {
                  const val = e.target.checked;
                  setForceIpv4(val);
                  await window.omniworkerAPI.setConfig(
                    "network.force_ipv4",
                    val ? "true" : "false",
                    profile,
                  );
                  setNetworkSaved(true);
                  setTimeout(() => setNetworkSaved(false), 2000);
                }}
              />
              <span className="tools-toggle-track" />
            </label>
          </label>
          <div className="settings-field-hint">
            {t("settings.forceIpv4Hint")}
          </div>
        </div>
        <div className="settings-field">
          <label className="settings-field-label">
            {t("settings.httpProxy")}
          </label>
          <input
            className="input"
            type="text"
            value={httpProxy}
            onChange={(e) => setHttpProxy(e.target.value)}
            onBlur={async () => {
              await window.omniworkerAPI.setConfig(
                "network.proxy",
                httpProxy.trim(),
                profile,
              );
              setNetworkSaved(true);
              setTimeout(() => setNetworkSaved(false), 2000);
            }}
            placeholder={t("settings.proxyPlaceholder")}
          />
          <div className="settings-field-hint">
            {t("settings.httpProxyHint")}
          </div>
        </div>
      </div>

      {connMode === "remote" && (
        <div className="settings-section">
          <div className="settings-section-title">
            {t("settings.serverConfigTitle")}
          </div>
          <div
            className="settings-field-hint"
            dangerouslySetInnerHTML={{ __html: t("settings.serverConfigHint") }}
          />
        </div>
      )}

      <div className="settings-section">
        <div className="settings-section-title">
          {t("settings.dataSection")}
        </div>
        <div className="settings-field">
          <div className="settings-field-hint" style={{ marginBottom: 10 }}>
            {t("settings.dataHint")}
          </div>

          {/* Export Backup */}
          <div
            style={{
              marginBottom: 16,
              padding: 16,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
              Export Backup
            </div>
            {backupInventory && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  {backupInventory.files.filter((f: any) => f.exists).length}{" "}
                  items found &middot;{" "}
                  {(backupInventory.totalSize / 1024).toFixed(0)} KB
                  {backupInventory.sessionCount > 0 &&
                    ` &middot; ${backupInventory.sessionCount} sessions`}
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    marginBottom: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeSessions}
                    onChange={(e) => {
                      setIncludeSessions(e.target.checked);
                      setBackupInventory(null);
                    }}
                  />
                  Include chat history ({backupInventory.sessionCount} sessions)
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeKanban}
                    onChange={(e) => {
                      setIncludeKanban(e.target.checked);
                      setBackupInventory(null);
                    }}
                  />
                  Include kanban tasks ({backupInventory.kanbanTaskCount} tasks)
                </label>
              </div>
            )}
            {backupProgress && (
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    height: 4,
                    background: "var(--bg-hover)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${backupProgress.percent}%`,
                      background: "var(--accent)",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  {backupProgress.phase}...
                </div>
              </div>
            )}
            <div className="settings-omniworker-actions">
              <button
                className="btn btn-secondary"
                onClick={handleBackup}
                disabled={backingUp}
              >
                <Download size={14} style={{ marginRight: 6 }} />
                {backingUp
                  ? "Exporting..."
                  : backupInventory
                    ? "Save Backup..."
                    : "Scan & Export"}
              </button>
              {backupInventory && !backingUp && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setBackupInventory(null)}
                  style={{ fontSize: 12 }}
                >
                  Cancel
                </button>
              )}
            </div>
            {backupResult && (
              <div
                className={`settings-omniworker-result ${backupResult.includes("success") || backupResult.includes("created") ? "success" : "error"}`}
                style={{ marginTop: 8 }}
              >
                {backupResult}
              </div>
            )}
          </div>

          {/* Import Backup */}
          <div
            style={{
              padding: 16,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
              Import Backup
            </div>
            {showImportPreview && importManifest ? (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Backup from:{" "}
                  {new Date(importManifest.createdAt).toLocaleString()}
                  &middot; Profile: {importManifest.profileName}
                  &middot;{" "}
                  {importManifest.items?.filter((i: any) => i.exists).length ||
                    "?"}{" "}
                  items
                </div>
                {importManifest.includesSessions && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      marginBottom: 2,
                    }}
                  >
                    Includes: Chat history
                  </div>
                )}
                {importManifest.includesKanban && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      marginBottom: 2,
                    }}
                  >
                    Includes: Kanban tasks
                  </div>
                )}
                <div
                  style={{
                    padding: "8px 12px",
                    background: "var(--warning-bg)",
                    border: "1px solid var(--warning)",
                    borderRadius: 4,
                    marginTop: 8,
                    fontSize: 12,
                    color: "var(--warning)",
                  }}
                >
                  This will overwrite your current data. The app will reload
                  after import.
                </div>
              </div>
            ) : null}
            {backupProgress && importing && (
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    height: 4,
                    background: "var(--bg-hover)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${backupProgress.percent}%`,
                      background: "var(--warning)",
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  {backupProgress.phase}...
                </div>
              </div>
            )}
            <div className="settings-omniworker-actions">
              <button
                className="btn btn-secondary"
                onClick={handleImport}
                disabled={importing}
              >
                <Upload size={14} style={{ marginRight: 6 }} />
                {importing
                  ? "Restoring..."
                  : showImportPreview
                    ? "Confirm Restore"
                    : "Select Backup File..."}
              </button>
              {showImportPreview && !importing && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowImportPreview(false);
                    setImportManifest(null);
                    setImportArchivePath(null);
                  }}
                  style={{ fontSize: 12 }}
                >
                  Cancel
                </button>
              )}
            </div>
            {importResult && (
              <div
                className={`settings-omniworker-result ${importResult.includes("success") || importResult.includes("Restored") ? "success" : "error"}`}
                style={{ marginTop: 8 }}
              >
                {importResult}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          <span
            style={{ cursor: "pointer" }}
            onClick={() => {
              const next = !logsExpanded;
              setLogsExpanded(next);
              if (next) loadLogs();
            }}
          >
            <FileText
              size={14}
              style={{ marginRight: 6, verticalAlign: "middle" }}
            />
            {t("settings.logsSection")} {logsExpanded ? "▾" : "▸"}
          </span>
        </div>
        {logsExpanded && (
          <div className="settings-field">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {["gateway.log", "agent.log", "errors.log"].map((f) => (
                <button
                  key={f}
                  className={`btn btn-sm ${logFile === f ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => {
                    setLogFile(f);
                    window.omniworkerAPI.readLogs(f, 300).then((r) => {
                      setLogContent(r.content);
                      setLogPath(r.path);
                    });
                  }}
                >
                  {f.replace(".log", "")}
                </button>
              ))}
              <button className="btn btn-sm btn-secondary" onClick={loadLogs}>
                {t("settings.refresh")}
              </button>
            </div>
            {logPath && (
              <div className="settings-field-hint" style={{ marginBottom: 4 }}>
                {logPath}
              </div>
            )}
            <pre
              className="settings-omniworker-doctor"
              style={{
                maxHeight: 300,
                overflow: "auto",
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {logContent || t("settings.emptyLog")}
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
    <div className="settings-language-select" ref={ref}>
      <button
        type="button"
        className="settings-language-trigger"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{LANGUAGE_NATIVE_NAMES[locale]}</span>
        <ChevronDown size={14} />
      </button>
      {isOpen && (
        <div className="settings-language-dropdown" role="listbox">
          {APP_LOCALES.map((l) => {
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                role="option"
                aria-selected={active}
                className={`settings-language-option ${active ? "active" : ""}`}
                onClick={() => {
                  onSelect(l);
                  setIsOpen(false);
                }}
              >
                <span>{LANGUAGE_NATIVE_NAMES[l]}</span>
                {active && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Settings;
