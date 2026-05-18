import { spawn, ChildProcess, spawnSync } from "child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import { createConnection } from "net";
import { getEnhancedPath, OMNIWORKER_HOME } from "./installer";
import { stripAnsi, safeWriteFile } from "./utils";

const OMNIWORKER_OFFICE_DIR = join(OMNIWORKER_HOME, "omniworker-office");

// Path to bundled Claw3D shipped with the desktop installer
function getBundledOfficeDir(): string | null {
  // In production, extraResources are unpacked next to the executable
  const bundled = join(process.resourcesPath, "omniworker-office");
  if (existsSync(join(bundled, "server.js"))) return bundled;
  // Development fallback: relative from out/main/
  const devFallback = join(__dirname, "../../resources/omniworker-office");
  if (existsSync(join(devFallback, "server.js"))) return devFallback;
  return null;
}
const DEV_PID_FILE = join(OMNIWORKER_HOME, "claw3d-dev.pid");
const ADAPTER_PID_FILE = join(OMNIWORKER_HOME, "claw3d-adapter.pid");
const PORT_FILE = join(OMNIWORKER_HOME, "claw3d-port");
const WS_URL_FILE = join(OMNIWORKER_HOME, "claw3d-ws-url");
const DEFAULT_PORT = 8765;
const DEFAULT_WS_URL = "ws://localhost:18789";
const CLAW3D_SETTINGS_DIR = join(homedir(), ".omniworker", "claw3d");

let devServerProcess: ChildProcess | null = null;
let adapterProcess: ChildProcess | null = null;
let devServerLogs = "";
let adapterLogs = "";
let devServerError = "";
let adapterError = "";

export interface ResolvedCommand {
  command: string;
  windowsScript: boolean;
}

interface CommandInvocation {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

export function isWindowsCommandScript(command: string): boolean {
  return /\.(cmd|bat)$/i.test(command);
}

export function pickWindowsCommandCandidate(
  candidates: string[],
): ResolvedCommand | null {
  const normalized = candidates
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const executable = normalized.find((candidate) => /\.exe$/i.test(candidate));
  if (executable) {
    return { command: executable, windowsScript: false };
  }

  const script = normalized.find(isWindowsCommandScript);
  if (script) {
    return { command: script, windowsScript: true };
  }

  const fallback = normalized[0];
  return fallback ? { command: fallback, windowsScript: false } : null;
}

function resolveCommandOnPath(
  command: string,
  envPath: string,
): ResolvedCommand | null {
  const lookupCommand = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookupCommand, [command], {
    encoding: "utf8",
    env: { ...process.env, PATH: envPath },
    timeout: 5000,
    windowsHide: true,
  });

  if (result.error || result.status !== 0 || !result.stdout) return null;

  const candidates = result.stdout.split(/\r?\n/);
  if (process.platform === "win32") {
    return pickWindowsCommandCandidate(candidates);
  }

  const resolved = candidates
    .map((candidate) => candidate.trim())
    .find(Boolean);
  return resolved ? { command: resolved, windowsScript: false } : null;
}

function resolveCommand(command: string, envPath: string): ResolvedCommand {
  const resolved = resolveCommandOnPath(command, envPath);
  if (resolved) return resolved;

  return {
    command,
    windowsScript:
      process.platform === "win32" && isWindowsCommandScript(command),
  };
}

function quoteWindowsCmdArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function buildWindowsScriptCommandLine(
  command: string,
  args: string[],
): string {
  const parts = [quoteWindowsCmdArg(command), ...args.map(quoteWindowsCmdArg)];
  return `"${parts.join(" ")}"`;
}

function createCommandInvocation(
  resolved: ResolvedCommand,
  args: string[],
): CommandInvocation {
  if (resolved.windowsScript) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        buildWindowsScriptCommandLine(resolved.command, args),
      ],
      windowsVerbatimArguments: true,
    };
  }

  return { command: resolved.command, args };
}

function getSavedPort(): number {
  try {
    const port = parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10);
    if (isNaN(port)) return DEFAULT_PORT;
    // Migrate old default port 3000 to new default 8765
    if (port === 3000) {
      setClaw3dPort(DEFAULT_PORT);
      return DEFAULT_PORT;
    }
    return port;
  } catch {
    return DEFAULT_PORT;
  }
}

export function setClaw3dPort(port: number): void {
  safeWriteFile(PORT_FILE, String(port));
  // Re-write .env with updated port
  writeClaw3dSettings();
}

export function getClaw3dPort(): number {
  return getSavedPort();
}

function getSavedWsUrl(): string {
  try {
    const url = readFileSync(WS_URL_FILE, "utf-8").trim();
    return url || DEFAULT_WS_URL;
  } catch {
    return DEFAULT_WS_URL;
  }
}

export function setClaw3dWsUrl(url: string): void {
  safeWriteFile(WS_URL_FILE, url);
  // Also update the settings.json so Claw3D picks it up
  writeClaw3dSettings(url);
}

export function getClaw3dWsUrl(): string {
  return getSavedWsUrl();
}

/**
 * Write Claw3D settings to ~/.omniworker/claw3d/settings.json
 * and .env in the claw3d directory so onboarding is skipped.
 */
function writeClaw3dSettings(wsUrl?: string): void {
  const url = wsUrl || getSavedWsUrl();

  // Write ~/.omniworker/claw3d/settings.json
  try {
    mkdirSync(CLAW3D_SETTINGS_DIR, { recursive: true });
    const settingsPath = join(CLAW3D_SETTINGS_DIR, "settings.json");

    // Preserve existing settings if present
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      /* fresh */
    }

    const settings = {
      ...existing,
      adapter: "omniworker",
      url,
      token: "",
    };
    safeWriteFile(settingsPath, JSON.stringify(settings, null, 2));
  } catch {
    /* non-fatal */
  }

  // Write .env in claw3d directory
  try {
    if (existsSync(OMNIWORKER_OFFICE_DIR)) {
      const envPath = join(OMNIWORKER_OFFICE_DIR, ".env");
      const port = getSavedPort();
      const envContent = [
        "# Auto-configured by OmniWorker Desktop",
        `PORT=${port}`,
        `HOST=127.0.0.1`,
        `NEXT_PUBLIC_GATEWAY_URL=${url}`,
        `CLAW3D_GATEWAY_URL=${url}`,
        `CLAW3D_GATEWAY_TOKEN=`,
        `OMNIWORKER_ADAPTER_PORT=18789`,
        `OMNIWORKER_MODEL=omniworker`,
        `OMNIWORKER_AGENT_NAME=OmniWorker`,
        "",
      ].join("\n");
      safeWriteFile(envPath, envContent);
    }
  } catch {
    /* non-fatal */
  }
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.setTimeout(300); // 300ms is plenty for localhost
    socket.on("connect", () => {
      socket.destroy();
      resolve(true); // port is in use
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false); // port is free
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function findFreePort(startPort: number = DEFAULT_PORT): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    const inUse = await checkPort(port);
    if (!inUse) return port;
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + 99}`);
}

export interface Claw3dStatus {
  cloned: boolean;
  installed: boolean;
  devServerRunning: boolean;
  adapterRunning: boolean;
  running: boolean; // true when both dev + adapter are up
  port: number;
  portInUse: boolean;
  wsUrl: string;
  error: string; // last error from either process
}

export interface Claw3dSetupProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(file: string): number | null {
  try {
    const pid = parseInt(readFileSync(file, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePid(file: string, pid: number): void {
  safeWriteFile(file, String(pid));
}

function cleanupPid(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    /* ignore */
  }
}

function isDevServerRunning(): boolean {
  if (devServerProcess && !devServerProcess.killed) return true;
  const pid = readPid(DEV_PID_FILE);
  if (pid && isProcessRunning(pid)) return true;
  cleanupPid(DEV_PID_FILE);
  return false;
}

function isAdapterRunning(): boolean {
  if (adapterProcess && !adapterProcess.killed) return true;
  const pid = readPid(ADAPTER_PID_FILE);
  if (pid && isProcessRunning(pid)) return true;
  cleanupPid(ADAPTER_PID_FILE);
  return false;
}

export async function getClaw3dStatus(): Promise<Claw3dStatus> {
  const bundled = getBundledOfficeDir();
  const hasStandalone = existsSync(join(OMNIWORKER_OFFICE_DIR, "server.js"));
  const hasPackageJson = existsSync(
    join(OMNIWORKER_OFFICE_DIR, "package.json"),
  );
  const hasNodeModules = existsSync(
    join(OMNIWORKER_OFFICE_DIR, "node_modules"),
  );
  const installed = hasStandalone || hasNodeModules;
  const port = getSavedPort();
  const devRunning = isDevServerRunning();
  // Only check port conflict when dev server is NOT running
  const portInUse = devRunning ? false : await checkPort(port);
  const adapterUp = isAdapterRunning();
  const error = devServerError || adapterError;
  return {
    cloned: hasStandalone || hasPackageJson || bundled !== null,
    installed,
    devServerRunning: devRunning,
    adapterRunning: adapterUp,
    running: devRunning,
    port,
    portInUse,
    wsUrl: getSavedWsUrl(),
    error,
  };
}

let _cachedNpmCommand: ResolvedCommand | null = null;

function findNpm(envPath = getEnhancedPath()): ResolvedCommand {
  if (_cachedNpmCommand) return _cachedNpmCommand;

  const home = homedir();

  if (process.platform === "win32") {
    const resolved = resolveCommandOnPath("npm", envPath);
    if (resolved) {
      _cachedNpmCommand = resolved;
      return resolved;
    }
  }

  // Try common locations first (no process spawn).
  // Includes nvm, nvm-windows, volta, fnm, and system paths.
  const candidates = [
    ...(process.platform === "win32"
      ? [
          process.env.NVM_SYMLINK
            ? join(process.env.NVM_SYMLINK, "npm.cmd")
            : undefined,
          join(home, "AppData", "Roaming", "npm", "npm.cmd"),
          process.env.ProgramFiles
            ? join(process.env.ProgramFiles, "nodejs", "npm.cmd")
            : undefined,
          process.env["ProgramFiles(x86)"]
            ? join(process.env["ProgramFiles(x86)"], "nodejs", "npm.cmd")
            : undefined,
        ]
      : []),
    join(home, ".volta", "bin", "npm"),
    join(home, ".asdf", "shims", "npm"),
    join(home, ".local", "share", "fnm", "aliases", "default", "bin", "npm"),
    join(home, ".fnm", "aliases", "default", "bin", "npm"),
    "/usr/local/bin/npm",
    "/opt/homebrew/bin/npm",
  ].filter((candidate): candidate is string => Boolean(candidate));

  // Discover nvm npm dynamically (active version)
  const nvmDir = process.env.NVM_DIR || join(home, ".nvm");
  const nvmVersions = join(nvmDir, "versions", "node");
  if (existsSync(nvmVersions)) {
    try {
      const versions = readdirSync(nvmVersions)
        .filter((d: string) => d.startsWith("v"))
        .sort()
        .reverse();
      for (const v of versions) {
        candidates.unshift(join(nvmVersions, v, "bin", "npm"));
      }
    } catch {
      /* non-fatal */
    }
  }

  for (const c of candidates) {
    if (existsSync(c)) {
      _cachedNpmCommand = {
        command: c,
        windowsScript:
          process.platform === "win32" && isWindowsCommandScript(c),
      };
      return _cachedNpmCommand;
    }
  }

  // Fallback path lookup only runs once because the result is cached.
  if (process.platform !== "win32") {
    const resolved = resolveCommandOnPath("npm", envPath);
    if (resolved) {
      _cachedNpmCommand = resolved;
      return resolved;
    }
  }

  _cachedNpmCommand = resolveCommand("npm", envPath);
  return _cachedNpmCommand;
}

export async function setupClaw3d(
  onProgress: (progress: Claw3dSetupProgress) => void,
): Promise<void> {
  const totalSteps = 2;
  let log = "";

  function emit(step: number, title: string, text: string): void {
    log += text;
    onProgress({
      step,
      totalSteps,
      title,
      detail: text.trim().slice(0, 120),
      log,
    });
  }

  const env = {
    ...process.env,
    PATH: getEnhancedPath(),
    HOME: homedir(),
    TERM: "dumb",
  };

  const bundledDir = getBundledOfficeDir();
  if (bundledDir) {
    // Fast path: copy bundled standalone build shipped with the app
    emit(
      1,
      "Installing Claw3D...",
      "Claw3D found in app bundle. Copying to workspace...\n",
    );

    const { cpSync, rmSync, renameSync } = require("fs");
    if (existsSync(OMNIWORKER_OFFICE_DIR)) {
      rmSync(OMNIWORKER_OFFICE_DIR, { recursive: true, force: true });
    }
    cpSync(bundledDir, OMNIWORKER_OFFICE_DIR, { recursive: true });
    
    // Restore node_modules if it was renamed to bypass electron-builder strips
    const bundledNmPath = join(OMNIWORKER_OFFICE_DIR, "bundled_node_modules");
    if (existsSync(bundledNmPath)) {
      renameSync(bundledNmPath, join(OMNIWORKER_OFFICE_DIR, "node_modules"));
    }
    
    emit(1, "Claw3D copied", "Successfully copied from bundle.\n");
  } else {
    // Fallback: clone from GitHub (for development without bundle)
    const git = resolveCommand("git", env.PATH);
    const cloned = existsSync(join(OMNIWORKER_OFFICE_DIR, "package.json"));

    if (!cloned) {
      emit(1, "Cloning Claw3D repository...", "Cloning from GitHub...\n");
      await new Promise<void>((resolve, reject) => {
        const gitClone = createCommandInvocation(git, [
          "clone",
          "https://github.com/iamlukethedev/Claw3D",
          OMNIWORKER_OFFICE_DIR,
        ]);
        const proc = spawn(gitClone.command, gitClone.args, {
          cwd: homedir(),
          env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          windowsVerbatimArguments: gitClone.windowsVerbatimArguments,
        });

        proc.stdout?.on("data", (data: Buffer) => {
          emit(1, "Cloning Claw3D repository...", stripAnsi(data.toString()));
        });
        proc.stderr?.on("data", (data: Buffer) => {
          emit(1, "Cloning Claw3D repository...", stripAnsi(data.toString()));
        });

        proc.on("close", (code) => {
          if (code === 0) {
            emit(1, "Cloning Claw3D repository...", "Clone complete.\n");
            resolve();
          } else {
            reject(new Error(`git clone failed (exit code ${code})`));
          }
        });
        proc.on("error", (err) =>
          reject(new Error(`Failed to run git: ${err.message}`)),
        );
      });
    } else {
      emit(1, "Claw3D already cloned", "Pulling latest...\n");
      await new Promise<void>((resolve) => {
        const gitPull = createCommandInvocation(git, ["pull", "--ff-only"]);
        const proc = spawn(gitPull.command, gitPull.args, {
          cwd: OMNIWORKER_OFFICE_DIR,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          windowsVerbatimArguments: gitPull.windowsVerbatimArguments,
        });

        proc.stdout?.on("data", (data: Buffer) => {
          emit(1, "Updating Claw3D...", stripAnsi(data.toString()));
        });
        proc.stderr?.on("data", (data: Buffer) => {
          emit(1, "Updating Claw3D...", stripAnsi(data.toString()));
        });

        proc.on("close", () => {
          resolve();
        });
        proc.on("error", () => resolve());
      });
    }
  }

  // Step 2: npm install (run even for bundled if node_modules is missing)
  if (!existsSync(join(OMNIWORKER_OFFICE_DIR, "node_modules"))) {
    emit(2, "Installing dependencies...", "Running npm install...\n");
    const npm = createCommandInvocation(findNpm(env.PATH), ["install"]);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(npm.command, npm.args, {
        cwd: OMNIWORKER_OFFICE_DIR,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        windowsVerbatimArguments: npm.windowsVerbatimArguments,
      });

      proc.stdout?.on("data", (data: Buffer) => {
        emit(2, "Installing dependencies...", stripAnsi(data.toString()));
      });
      proc.stderr?.on("data", (data: Buffer) => {
        emit(2, "Installing dependencies...", stripAnsi(data.toString()));
      });

      proc.on("close", (code) => {
        if (code === 0) {
          emit(2, "Installing dependencies...", "Dependencies installed.\n");
          resolve();
        } else {
          reject(new Error(`npm install failed (exit code ${code})`));
        }
      });
      proc.on("error", (err) =>
        reject(new Error(`Failed to run npm: ${err.message}`)),
      );
    });
  } else {
    emit(2, "Dependencies ready", "node_modules already exists.\n");
  }

  writeClaw3dSettings();
}

function killProcessTree(proc: ChildProcess): void {
  if (proc.pid) {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* already dead */
      }
    }
    // Fallback: SIGKILL after 3 seconds
    setTimeout(() => {
      try {
        if (proc.pid) process.kill(-proc.pid, "SIGKILL");
      } catch {
        /* already dead */
      }
    }, 3000);
  }
}

export async function startDevServer(): Promise<boolean> {
  if (isDevServerRunning()) return true;

  devServerError = "";
  devServerLogs = "";
  let port = getSavedPort();

  // If the preferred port is in use, find a free one
  const portInUse = await checkPort(port);
  if (portInUse) {
    try {
      port = await findFreePort(port + 1);
      setClaw3dPort(port);
    } catch (err) {
      devServerError = `No free port found near ${getSavedPort()}. ${(err as Error).message}`;
      return false;
    }
  }

  const env = {
    ...process.env,
    PATH: getEnhancedPath(),
    HOME: homedir(),
    TERM: "dumb",
    PORT: String(port),
  };

  // Check if we have a bundled standalone build
  const hasStandalone = existsSync(join(OMNIWORKER_OFFICE_DIR, "server.js"));
  const hasNodeModules = existsSync(
    join(OMNIWORKER_OFFICE_DIR, "node_modules"),
  );

  if (!hasStandalone && !hasNodeModules) return false;

  let proc: ChildProcess;

  if (hasStandalone) {
    // Use production standalone server (no npm needed)
    proc = spawn("node", ["server.js"], {
      cwd: OMNIWORKER_OFFICE_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
    });
  } else {
    // Fallback: use npm run dev (legacy clone path)
    const npm = createCommandInvocation(findNpm(env.PATH), ["run", "dev"]);
    proc = spawn(npm.command, npm.args, {
      cwd: OMNIWORKER_OFFICE_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
      windowsVerbatimArguments: npm.windowsVerbatimArguments,
    });
  }

  devServerProcess = proc;
  if (proc.pid) writePid(DEV_PID_FILE, proc.pid);

  proc.stdout?.on("data", (data: Buffer) => {
    devServerLogs += stripAnsi(data.toString());
    // Keep only last 2000 chars
    if (devServerLogs.length > 2000) devServerLogs = devServerLogs.slice(-2000);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const text = stripAnsi(data.toString());
    devServerLogs += text;
    if (devServerLogs.length > 2000) devServerLogs = devServerLogs.slice(-2000);
    // Capture real errors (not warnings)
    if (
      /error|EADDRINUSE|ENOENT|failed|fatal/i.test(text) &&
      !/warning/i.test(text)
    ) {
      devServerError = text.trim().slice(0, 300);
    }
  });

  proc.on("close", (code) => {
    if (code && code !== 0 && !devServerError) {
      devServerError = `Dev server exited with code ${code}. Check if port ${port} is available.`;
    }
    devServerProcess = null;
    cleanupPid(DEV_PID_FILE);
  });

  proc.unref();
  return true;
}

export function stopDevServer(): void {
  if (devServerProcess) {
    killProcessTree(devServerProcess);
    devServerProcess = null;
  }

  const pid = readPid(DEV_PID_FILE);
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already dead */
      }
    }
  }
  cleanupPid(DEV_PID_FILE);
}

export function startAdapter(): boolean {
  if (isAdapterRunning()) return true;
  if (!existsSync(join(OMNIWORKER_OFFICE_DIR, "node_modules"))) return false;

  adapterError = "";
  adapterLogs = "";
  const env = {
    ...process.env,
    PATH: getEnhancedPath(),
    HOME: homedir(),
    TERM: "dumb",
  };
  const npm = createCommandInvocation(findNpm(env.PATH), [
    "run",
    "omniworker-adapter",
  ]);
  const proc = spawn(npm.command, npm.args, {
    cwd: OMNIWORKER_OFFICE_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    windowsHide: true,
    windowsVerbatimArguments: npm.windowsVerbatimArguments,
  });

  adapterProcess = proc;
  if (proc.pid) writePid(ADAPTER_PID_FILE, proc.pid);

  proc.stdout?.on("data", (data: Buffer) => {
    adapterLogs += stripAnsi(data.toString());
    if (adapterLogs.length > 2000) adapterLogs = adapterLogs.slice(-2000);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const text = stripAnsi(data.toString());
    adapterLogs += text;
    if (adapterLogs.length > 2000) adapterLogs = adapterLogs.slice(-2000);
    if (
      /error|EADDRINUSE|ENOENT|failed|fatal/i.test(text) &&
      !/warning/i.test(text)
    ) {
      adapterError = text.trim().slice(0, 300);
    }
  });

  proc.on("close", (code) => {
    if (code && code !== 0 && !adapterError) {
      adapterError = `OmniWorker adapter exited with code ${code}`;
    }
    adapterProcess = null;
    cleanupPid(ADAPTER_PID_FILE);
  });

  proc.unref();
  return true;
}

export function stopAdapter(): void {
  if (adapterProcess) {
    killProcessTree(adapterProcess);
    adapterProcess = null;
  }

  const pid = readPid(ADAPTER_PID_FILE);
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already dead */
      }
    }
  }
  cleanupPid(ADAPTER_PID_FILE);
}

export async function startAll(): Promise<{
  success: boolean;
  error?: string;
}> {
  const hasStandalone = existsSync(join(OMNIWORKER_OFFICE_DIR, "server.js"));
  const hasNodeModules = existsSync(
    join(OMNIWORKER_OFFICE_DIR, "node_modules"),
  );

  // If we have a bundled dir, and the user is missing standalone or node_modules, we should install it.
  // This also upgrades legacy installs (which lack server.js) to standalone automatically.
  const bundledDir = getBundledOfficeDir();
  const needsInstall = bundledDir ? (!hasStandalone || !hasNodeModules) : (!hasStandalone && !hasNodeModules);

  if (needsInstall) {
    if (bundledDir) {
      try {
        await setupClaw3d(() => {
          /* no-op progress for auto-install */
        });
      } catch (err) {
        return {
          success: false,
          error: `Failed to install Claw3D from bundle: ${(err as Error).message}`,
        };
      }
    } else {
      return {
        success: false,
        error: "Claw3D is not installed. Please install it first.",
      };
    }
  }

  const port = getSavedPort();

  // Start dev server
  const devOk = await startDevServer();
  if (!devOk) {
    return {
      success: false,
      error: `Failed to start dev server on port ${port}`,
    };
  }

  // Start adapter only for legacy (non-standalone) installs
  if (hasNodeModules && !hasStandalone) {
    const adapterOk = startAdapter();
    if (!adapterOk) {
      return { success: false, error: "Failed to start OmniWorker adapter" };
    }
  }

  return { success: true };
}

export function stopAll(): void {
  stopDevServer();
  stopAdapter();
  devServerError = "";
  adapterError = "";
}

export function getClaw3dLogs(): string {
  return [
    devServerLogs ? `=== Dev Server ===\n${devServerLogs}` : "",
    adapterLogs ? `=== Adapter ===\n${adapterLogs}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
