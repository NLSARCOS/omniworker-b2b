import { existsSync, mkdirSync, readFileSync, statSync, chmodSync, createWriteStream } from "fs";
import { join } from "path";
import { spawn, execSync } from "child_process";
import type { ChildProcess } from "child_process";
import Database from "better-sqlite3";
import https from "https";
import { extract } from "tar";
import { tmpdir } from "os";
import { profileHome, profilePaths, safeWriteFile } from "./utils";

const MEMORY_CHAR_LIMIT = 2200;
const USER_CHAR_LIMIT = 1375;

export type MemoryChangeTarget = "memory" | "user";
type MemoryChangeCallback = (changed: MemoryChangeTarget) => void;

const configEnsureCache = new Map<string, { mtimeMs: number; size: number }>();
const subscribers = new Set<MemoryChangeCallback>();

export interface MemoryEntry {
  index: number;
  content: string;
}

export interface MemoryInfo {
  memory: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    entries: MemoryEntry[];
    charCount: number;
    charLimit: number;
  };
  user: {
    content: string;
    exists: boolean;
    lastModified: number | null;
    charCount: number;
    charLimit: number;
  };
  stats: { totalSessions: number; totalMessages: number };
}

function memoryPath(profile?: string): string {
  return join(profileHome(profile), "memories", "MEMORY.md");
}

function userPath(profile?: string): string {
  return join(profileHome(profile), "memories", "USER.md");
}

function readFileSafe(filePath: string): {
  content: string;
  exists: boolean;
  lastModified: number | null;
} {
  if (!existsSync(filePath)) {
    return { content: "", exists: false, lastModified: null };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const stat = statSync(filePath);
    return {
      content,
      exists: true,
      lastModified: Math.floor(stat.mtimeMs / 1000),
    };
  } catch {
    return { content: "", exists: false, lastModified: null };
  }
}

function parseMemoryEntries(content: string): MemoryEntry[] {
  if (!content.trim()) return [];
  return content
    .split("\n§\n")
    .map((entry, index) => ({ index, content: entry.trim() }))
    .filter((e) => e.content.length > 0);
}

function serializeEntries(entries: MemoryEntry[]): string {
  return entries.map((e) => e.content).join("\n§\n");
}

const writeFileSafe = safeWriteFile;

function getSessionStats(profile?: string): {
  totalSessions: number;
  totalMessages: number;
} {
  const home = profileHome(profile);
  const dbPath = join(home, "state.db");
  if (!existsSync(dbPath)) return { totalSessions: 0, totalMessages: 0 };

  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      const sessionRow = db
        .prepare("SELECT COUNT(*) as count FROM sessions")
        .get() as { count: number } | undefined;
      const messageRow = db
        .prepare("SELECT COUNT(*) as count FROM messages")
        .get() as { count: number } | undefined;
      return {
        totalSessions: sessionRow?.count ?? 0,
        totalMessages: messageRow?.count ?? 0,
      };
    } finally {
      db.close();
    }
  } catch (err) {
    console.error("[memory] getSessionStats failed:", err);
    return { totalSessions: 0, totalMessages: 0 };
  }
}

// ── Engram Binary & Bootstrap ────────────────────────
export function findEngramBinary(): string {
  const isWin = process.platform === "win32";
  const binaryName = isWin ? "engram.exe" : "engram";
  const userHome = process.env.USERPROFILE || process.env.HOME || "";
  const standardPaths = [
    "/opt/homebrew/bin/engram",
    "/usr/local/bin/engram",
    join(userHome, ".engram", "bin", binaryName),
  ];
  for (const p of standardPaths) {
    if (existsSync(p)) return p;
  }
  try {
    const whichCmd = isWin ? "where engram" : "which engram";
    const path = execSync(whichCmd, { encoding: "utf-8" }).trim();
    if (path) return path;
  } catch {}
  return binaryName;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function get(currentUrl: string) {
      https.get(currentUrl, {
        headers: {
          "User-Agent": "omniworker-desktop"
        }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            get(redirectUrl);
            return;
          }
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status code ${res.statusCode}`));
          return;
        }
        const fileStream = createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });
        fileStream.on("error", (err) => {
          reject(err);
        });
      }).on("error", (err) => {
        reject(err);
      });
    }
    get(url);
  });
}

export async function bootstrapEngram(onProgress?: (detail: string, step: number) => void): Promise<boolean> {
  const binary = findEngramBinary();
  const isWin = process.platform === "win32";
  const binaryName = isWin ? "engram.exe" : "engram";
  const userHome = process.env.USERPROFILE || process.env.HOME || "";
  const binDir = join(userHome, ".engram", "bin");
  const targetPath = join(binDir, binaryName);

  onProgress?.("Comprobando instalación de Engram...", 1);

  if (existsSync(targetPath)) {
    onProgress?.("Engram ya está instalado.", 3);
    return true;
  }
  if (binary !== binaryName && existsSync(binary)) {
    onProgress?.("Engram ya está instalado en el sistema.", 3);
    return true;
  }

  // 1. Try Homebrew on macOS as preferred path
  if (process.platform === "darwin") {
    console.log("[Engram] Binary not found. Attempting to install via Homebrew...");
    onProgress?.("Intentando instalar Engram vía Homebrew...", 1);
    try {
      execSync("brew install gentleman-programming/tap/engram", {
        stdio: "ignore",
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` }
      });
      console.log("[Engram] Successfully installed engram via Homebrew tap!");
      if (existsSync(findEngramBinary())) {
        onProgress?.("¡Engram instalado con éxito vía Homebrew!", 3);
        return true;
      }
    } catch (err) {
      console.warn("[Engram] Homebrew install failed. Falling back to static download.", err);
      onProgress?.("Homebrew no disponible. Descargando de GitHub...", 2);
    }
  } else {
    onProgress?.("Descargando binario de Engram desde GitHub...", 2);
  }

  // 2. Fallback to direct static download from GitHub releases (Zero-Touch)
  console.log("[Engram] Downloading precompiled static binary from GitHub releases...");
  try {
    const version = "0.1.4"; // Pinned stable version
    let osPlatform = process.platform as string;
    if (osPlatform === "win32") osPlatform = "windows";

    let osArch = process.arch as string;
    if (osArch === "x64") osArch = "amd64";

    const ext = osPlatform === "windows" ? "zip" : "tar.gz";
    const archiveName = `engram_${version}_${osPlatform}_${osArch}.${ext}`;
    const downloadUrl = `https://github.com/Gentleman-Programming/engram/releases/download/v${version}/${archiveName}`;

    if (!existsSync(binDir)) {
      mkdirSync(binDir, { recursive: true });
    }

    const archivePath = join(tmpdir(), archiveName);
    console.log(`[Engram] Fetching: ${downloadUrl}`);
    onProgress?.(`Descargando engram_${version}_${osPlatform}_${osArch}.${ext}...`, 2);
    await downloadFile(downloadUrl, archivePath);
    console.log("[Engram] Download complete. Extracting archive...");
    onProgress?.("Extrayendo archivos de Engram...", 3);

    if (osPlatform === "windows") {
      // Windows extraction using built-in PowerShell Expand-Archive
      execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${binDir}' -Force"`, {
        stdio: "ignore"
      });
    } else {
      // macOS/Linux extraction using node-tar
      await extract({ cwd: binDir, file: archivePath });
      // Set execution permission
      chmodSync(targetPath, 0o755);
    }

    console.log(`[Engram] Successfully bootstrapped Engram binary to: ${targetPath}`);
    onProgress?.("¡Engram instalado con éxito!", 3);
    return true;
  } catch (err) {
    console.error("[Engram] Static release bootstrap failed:", err);
    onProgress?.(`Error instalando Engram: ${(err as Error).message}`, 3);
    return false;
  }
}

// ── Engram Serve Daemon Manager ──────────────────────
export class EngramDaemonManager {
  private static process: ChildProcess | null = null;
  private static currentProfile: string | undefined = undefined;

  public static async startDaemon(profile?: string): Promise<boolean> {
    if (this.process && this.currentProfile === profile) {
      return true;
    }
    await this.stopDaemon();

    await bootstrapEngram();
    const engramPath = findEngramBinary();
    const dataDir = join(profileHome(profile), "engram");

    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    console.log(`[Engram] Spawning serve on port 7437 (Data: ${dataDir})`);
    
    this.process = spawn(engramPath, ["serve"], {
      env: {
        ...process.env,
        ENGRAM_DATA_DIR: dataDir,
        ENGRAM_PORT: "7437",
        PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false
    });

    this.currentProfile = profile;

    this.process.stdout?.on("data", (data) => {
      console.log(`[Engram Server] ${data.toString().trim()}`);
    });
    this.process.stderr?.on("data", (data) => {
      console.error(`[Engram Server Error] ${data.toString().trim()}`);
    });

    this.process.on("close", (code) => {
      console.log(`[Engram Server] Process exited with code ${code}`);
      this.process = null;
      this.currentProfile = undefined;
    });

    const healthy = await this.waitForHealthy(3000);
    if (!healthy) {
      console.error("[Engram] Daemon did not start healthily on port 7437.");
      await this.stopDaemon();
      return false;
    }

    // Auto-create standard omniworker default session
    try {
      await fetch("http://127.0.0.1:7437/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "desktop-session-default",
          project: "omniworker",
          directory: profileHome(profile)
        })
      });
    } catch {}

    return true;
  }

  public static async stopDaemon(): Promise<void> {
    if (!this.process) return;
    const p = this.process;
    this.process = null;
    this.currentProfile = undefined;

    return new Promise<void>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          p.kill("SIGKILL");
          resolve();
        }
      }, 1000);

      p.once("exit", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve();
        }
      });
      p.kill("SIGTERM");
    });
  }

  private static async waitForHealthy(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch("http://127.0.0.1:7437/health");
        if (res.ok) {
          const body = await res.json();
          if (body.status === "ok") return true;
        }
      } catch {
        // server not up yet
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  }
}

// ── Memory Changes Subscriptions ─────────────────────
function notifySubscribers(changed: MemoryChangeTarget) {
  for (const subscriber of subscribers) {
    try {
      subscriber(changed);
    } catch (err) {
      console.error(err);
    }
  }
}

export function subscribeMemoryChanges(
  _profile: string | undefined,
  callback: MemoryChangeCallback,
): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function cleanupMemoryWatchers(): void {
  subscribers.clear();
}

// ── Read ────────────────────────────────────────────
export function ensureMemoryConfig(profile?: string): void {
  const { configFile } = profilePaths(profile);
  const key = profile || "default";
  let content: string;
  let originalStat: { mtimeMs: number; size: number } | null = null;

  if (existsSync(configFile)) {
    try {
      const stat = statSync(configFile);
      originalStat = { mtimeMs: stat.mtimeMs, size: stat.size };
      const cached = configEnsureCache.get(key);
      if (
        cached &&
        cached.mtimeMs === originalStat.mtimeMs &&
        cached.size === originalStat.size
      ) {
        return;
      }
      content = readFileSync(configFile, "utf-8");
    } catch {
      content = "";
    }
  } else {
    content = "";
  }

  const originalContent = content;
  const required = [
    { key: "memory_enabled", value: "true" },
    { key: "user_profile_enabled", value: "true" },
    { key: "nudge_interval", value: "10" },
  ];

  const lines = content.trim() ? content.split("\n") : [];
  const memLineIdx = lines.findIndex((line) => /^memory:\s*.*$/.test(line));

  if (memLineIdx === -1) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    lines.push("memory:");
    lines.push(...required.map(({ key, value }) => `  ${key}: ${value}`));
    content = lines.join("\n") + "\n";
  } else {
    lines[memLineIdx] = "memory:";
    let blockEndIdx = memLineIdx + 1;
    while (blockEndIdx < lines.length) {
      const line = lines[blockEndIdx];
      const isTopLevelKey = /^[^\s#][^:]*:\s*/.test(line);
      if (isTopLevelKey) break;
      blockEndIdx++;
    }

    const memoryBlock = lines.slice(memLineIdx + 1, blockEndIdx).join("\n");
    const missing = required.filter(
      ({ key }) => !new RegExp(`^\\s+${key}:\\s*`, "m").test(memoryBlock),
    );

    if (missing.length > 0) {
      lines.splice(
        blockEndIdx,
        0,
        ...missing.map(({ key, value }) => `  ${key}: ${value}`),
      );
      content = lines.join("\n");
    }
  }

  if (content && !content.endsWith("\n")) {
    content += "\n";
  }

  if (content !== originalContent || !originalStat) {
    safeWriteFile(configFile, content);
  }

  try {
    const stat = statSync(configFile);
    configEnsureCache.set(key, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
  } catch {
    configEnsureCache.delete(key);
  }
}

export async function readMemory(profile?: string): Promise<MemoryInfo> {
  try {
    await EngramDaemonManager.startDaemon(profile);

    const obsRes = await fetch("http://127.0.0.1:7437/observations/recent?project=omniworker&limit=100");
    if (!obsRes.ok) throw new Error("Engram fetch failed");
    const obs: any[] = await obsRes.json();

    const entries: MemoryEntry[] = [];
    let userContent = "";

    for (const o of obs) {
      if (o.topic_key === "user-profile" || o.type === "user-profile") {
        userContent = o.content || "";
      } else {
        entries.push({
          index: o.id,
          content: o.content || "",
        });
      }
    }

    entries.sort((a, b) => a.index - b.index);
    const stats = getSessionStats(profile);

    return {
      memory: {
        content: entries.map((e) => e.content).join("\n§\n"),
        exists: true,
        lastModified: Date.now(),
        entries: entries,
        charCount: entries.map((e) => e.content).join("\n§\n").length,
        charLimit: MEMORY_CHAR_LIMIT,
      },
      user: {
        content: userContent,
        exists: true,
        lastModified: Date.now(),
        charCount: userContent.length,
        charLimit: USER_CHAR_LIMIT,
      },
      stats,
    };
  } catch (err) {
    console.warn("[Engram] readMemory failed, falling back to flat files:", err);
    const memFile = readFileSafe(memoryPath(profile));
    const userFile = readFileSafe(userPath(profile));

    return {
      memory: {
        ...memFile,
        entries: parseMemoryEntries(memFile.content),
        charCount: memFile.content.length,
        charLimit: MEMORY_CHAR_LIMIT,
      },
      user: {
        ...userFile,
        charCount: userFile.content.length,
        charLimit: USER_CHAR_LIMIT,
      },
      stats: getSessionStats(profile),
    };
  }
}

// ── Write operations ────────────────────────────────
export async function addMemoryEntry(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await EngramDaemonManager.startDaemon(profile);

    const res = await fetch("http://127.0.0.1:7437/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "desktop-session-default",
        type: "fact",
        title: content.substring(0, 40) + (content.length > 40 ? "..." : ""),
        content: content,
        project: "omniworker",
        scope: "personal",
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to create observation");
    }

    // Write to offline flat file backup
    const filePath = memoryPath(profile);
    const existing = readFileSafe(filePath);
    const entries = parseMemoryEntries(existing.content);
    const newContent = serializeEntries([
      ...entries,
      { index: entries.length, content: content.trim() },
    ]);
    writeFileSafe(filePath, newContent);

    notifySubscribers("memory");
    return { success: true };
  } catch (err: any) {
    console.error("[Engram] addMemoryEntry failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function updateMemoryEntry(
  index: number,
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await EngramDaemonManager.startDaemon(profile);

    const res = await fetch(`http://127.0.0.1:7437/observations/${index}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content,
        title: content.substring(0, 40) + (content.length > 40 ? "..." : ""),
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to update observation");
    }

    notifySubscribers("memory");
    return { success: true };
  } catch (err: any) {
    console.error("[Engram] updateMemoryEntry failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function removeMemoryEntry(
  index: number,
  profile?: string,
): Promise<boolean> {
  try {
    await EngramDaemonManager.startDaemon(profile);

    const res = await fetch(`http://127.0.0.1:7437/observations/${index}?hard=true`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error("Delete observation failed");

    notifySubscribers("memory");
    return true;
  } catch (err) {
    console.error("[Engram] removeMemoryEntry failed:", err);
    return false;
  }
}

export async function writeUserProfile(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await EngramDaemonManager.startDaemon(profile);

    // Check if user-profile observation already exists
    const obsRes = await fetch("http://127.0.0.1:7437/observations/recent?project=omniworker&limit=100");
    if (!obsRes.ok) throw new Error("Engram fetch failed");
    const obs: any[] = await obsRes.json();
    const existingProfile = obs.find(o => o.topic_key === "user-profile" || o.type === "user-profile");

    if (existingProfile) {
      // Update
      const res = await fetch(`http://127.0.0.1:7437/observations/${existingProfile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
    } else {
      // Create
      const res = await fetch("http://127.0.0.1:7437/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "desktop-session-default",
          type: "user-profile",
          title: "User Profile",
          content: content,
          topic_key: "user-profile",
          scope: "personal",
        }),
      });
      if (!res.ok) throw new Error("Failed to create profile");
    }

    // Write to offline flat file backup
    writeFileSafe(userPath(profile), content);

    notifySubscribers("user");
    return { success: true };
  } catch (err: any) {
    console.error("[Engram] writeUserProfile failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

// ── Engram Dashboard Helpers ────────────────────────
export async function searchObservations(
  query: string,
  limit = 20,
  project = "omniworker",
  scope = "personal",
): Promise<any[]> {
  try {
    const q = encodeURIComponent(query);
    const proj = encodeURIComponent(project);
    const sc = encodeURIComponent(scope);
    const res = await fetch(`http://127.0.0.1:7437/search?q=${q}&project=${proj}&scope=${sc}&limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getTimeline(
  observationId?: number,
  before = 5,
  after = 5,
): Promise<any[]> {
  try {
    if (!observationId) return [];
    const res = await fetch(`http://127.0.0.1:7437/timeline?observation_id=${observationId}&before=${before}&after=${after}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function getConflicts(
  project = "omniworker",
  status = "pending",
  limit = 50,
): Promise<any> {
  try {
    const proj = encodeURIComponent(project);
    const st = encodeURIComponent(status);
    const res = await fetch(`http://127.0.0.1:7437/conflicts?project=${proj}&status=${st}&limit=${limit}`);
    if (!res.ok) return { total: 0, relations: [] };
    return await res.json();
  } catch {
    return { total: 0, relations: [] };
  }
}

export async function judgeConflict(
  judgmentId: string,
  relation: string,
  reason = "",
  confidence = 1.0,
): Promise<any> {
  try {
    const res = await fetch("http://127.0.0.1:7437/conflicts/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        judgment_id: judgmentId,
        relation,
        reason,
        confidence,
      }),
    });
    if (!res.ok) return { success: false };
    return await res.json();
  } catch {
    return { success: false };
  }
}

export async function getSyncStatus(project = "omniworker"): Promise<any> {
  try {
    const proj = encodeURIComponent(project);
    const res = await fetch(`http://127.0.0.1:7437/sync/status?project=${proj}`);
    if (!res.ok) return { enabled: false };
    return await res.json();
  } catch {
    return { enabled: false };
  }
}

export async function triggerSync(_project = "omniworker"): Promise<any> {
  try {
    // Engram cloud autotrigger via POST /conflicts/deferred/replay or by re-scanning
    const res = await fetch("http://127.0.0.1:7437/conflicts/deferred/replay", {
      method: "POST",
    });
    if (!res.ok) return { success: false };
    return { success: true };
  } catch {
    return { success: false };
  }
}

export function discoverMemoryProviders(_profile?: string): string[] {
  return ["engram"];
}

