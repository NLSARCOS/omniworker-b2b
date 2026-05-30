import { existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
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
export async function bootstrapEngram(_onProgress?: (detail: string, step: number) => void): Promise<boolean> {
  if (_onProgress) {
    _onProgress("Utilizando almacenamiento local plano 100% offline.", 3);
  }
  return true;
}

// ── Engram Serve Daemon Manager (Stubbed) ──────────────────────
export class EngramDaemonManager {
  public static async startDaemon(_profile?: string): Promise<boolean> {
    return true;
  }

  public static async stopDaemon(): Promise<void> {
    return;
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

// ── Write operations ────────────────────────────────
export async function addMemoryEntry(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = memoryPath(profile);
    const dirPath = join(profileHome(profile), "memories");
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
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
    console.error("addMemoryEntry failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function updateMemoryEntry(
  index: number,
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = memoryPath(profile);
    const existing = readFileSafe(filePath);
    const entries = parseMemoryEntries(existing.content);
    const target = entries.find((e) => e.index === index);
    if (target) {
      target.content = content.trim();
      writeFileSafe(filePath, serializeEntries(entries));
      notifySubscribers("memory");
      return { success: true };
    }
    return { success: false, error: `Entry index ${index} not found` };
  } catch (err: any) {
    console.error("updateMemoryEntry failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function removeMemoryEntry(
  index: number,
  profile?: string,
): Promise<boolean> {
  try {
    const filePath = memoryPath(profile);
    const existing = readFileSafe(filePath);
    const entries = parseMemoryEntries(existing.content);
    const filtered = entries.filter((e) => e.index !== index);
    const reindexed = filtered.map((e, idx) => ({ index: idx, content: e.content }));
    writeFileSafe(filePath, serializeEntries(reindexed));
    notifySubscribers("memory");
    return true;
  } catch (err) {
    console.error("removeMemoryEntry failed:", err);
    return false;
  }
}

export async function writeUserProfile(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const dirPath = join(profileHome(profile), "memories");
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
    writeFileSafe(userPath(profile), content);
    notifySubscribers("user");
    return { success: true };
  } catch (err: any) {
    console.error("writeUserProfile failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

// ── Engram Dashboard Helpers (Stubbed) ────────────────────────
export async function searchObservations(
  _query: string,
  _limit = 20,
  _project = "omniworker",
  _scope = "personal",
): Promise<any[]> {
  return [];
}

export async function getTimeline(
  _observationId?: number,
  _before = 5,
  _after = 5,
): Promise<any[]> {
  return [];
}

export async function getConflicts(
  _project = "omniworker",
  _status = "pending",
  _limit = 50,
): Promise<any> {
  return { total: 0, relations: [] };
}

export async function judgeConflict(
  _judgmentId: string,
  _relation: string,
  _reason = "",
  _confidence = 1.0,
): Promise<any> {
  return { success: true };
}

export async function getSyncStatus(_project = "omniworker"): Promise<any> {
  return { enabled: false };
}

export async function triggerSync(_project = "omniworker"): Promise<any> {
  return { success: true };
}

export function discoverMemoryProviders(_profile?: string): string[] {
  return ["offline_fts"];
}


