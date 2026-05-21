import { existsSync, mkdirSync, readFileSync, statSync, watch } from "fs";
import type { FSWatcher } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { profileHome, profilePaths, safeWriteFile } from "./utils";

const ENTRY_DELIMITER = "\n§\n";
const MEMORY_CHAR_LIMIT = 2200;
const USER_CHAR_LIMIT = 1375;

export type MemoryChangeTarget = "memory" | "user";

type ConfigEnsureCacheEntry = { mtimeMs: number; size: number };
type MemoryChangeCallback = (changed: MemoryChangeTarget) => void;
type MemoryWatchState = {
  watcher: FSWatcher;
  subscribers: Set<MemoryChangeCallback>;
  pending: Set<MemoryChangeTarget>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
};

const configEnsureCache = new Map<string, ConfigEnsureCacheEntry>();
const memoryWatchers = new Map<string, MemoryWatchState>();

function cacheKey(profile?: string): string {
  return profile || "default";
}

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
    .split(ENTRY_DELIMITER)
    .map((entry, index) => ({ index, content: entry.trim() }))
    .filter((e) => e.content.length > 0);
}

function serializeEntries(entries: MemoryEntry[]): string {
  return entries.map((e) => e.content).join(ENTRY_DELIMITER);
}

// Use shared safeWriteFile from utils
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

// ── Read ────────────────────────────────────────────

/**
 * Ensure the profile's config.yaml has the memory section with required defaults.
 * Only writes keys that are completely absent from the memory: block.
 * Preserves any existing provider, limits, or other settings.
 * Safe to call on a fresh profile (config may not exist yet).
 * Skipped in remote-only mode (checked by callers).
 */
export function ensureMemoryConfig(profile?: string): void {
  const { configFile } = profilePaths(profile);

  const key = cacheKey(profile);
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

  // Keys to ensure are present (only if the top-level key is missing)
  const required: Array<{ key: string; value: string }> = [
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
    // Normalize scalar/commented `memory: ...` into a mapping block.
    lines[memLineIdx] = "memory:";

    // Block ends at the next non-comment top-level key. Blank lines and
    // comments inside the block are tolerated.
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

export function cleanupMemoryWatchers(): void {
  for (const state of memoryWatchers.values()) {
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.watcher.close();
  }
  memoryWatchers.clear();
}

export function subscribeMemoryChanges(
  profile: string | undefined,
  callback: MemoryChangeCallback,
): () => void {
  const key = cacheKey(profile);
  let state = memoryWatchers.get(key);

  if (!state) {
    const memoriesDir = join(profileHome(profile), "memories");
    if (!existsSync(memoriesDir)) mkdirSync(memoriesDir, { recursive: true });

    state = {
      watcher: watch(memoriesDir, (_eventType, filename) => {
        const name = filename?.toString();
        const target =
          name === "MEMORY.md" ? "memory" : name === "USER.md" ? "user" : null;
        if (!target) return;

        const current = memoryWatchers.get(key);
        if (!current) return;
        current.pending.add(target);
        if (current.debounceTimer) clearTimeout(current.debounceTimer);
        current.debounceTimer = setTimeout(() => {
          const latest = memoryWatchers.get(key);
          if (!latest) return;
          const pending = Array.from(latest.pending);
          latest.pending.clear();
          latest.debounceTimer = null;
          for (const changed of pending) {
            for (const subscriber of latest.subscribers) {
              subscriber(changed);
            }
          }
        }, 150);
      }),
      subscribers: new Set(),
      pending: new Set(),
      debounceTimer: null,
    };

    state.watcher.on("error", (err) => {
      console.error("[memory] watcher failed:", err);
    });
    memoryWatchers.set(key, state);
  }

  state.subscribers.add(callback);

  return () => {
    const current = memoryWatchers.get(key);
    if (!current) return;
    current.subscribers.delete(callback);
    if (current.subscribers.size === 0) {
      if (current.debounceTimer) clearTimeout(current.debounceTimer);
      current.watcher.close();
      memoryWatchers.delete(key);
    }
  };
}

export function readMemory(profile?: string): MemoryInfo {
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

export function addMemoryEntry(
  content: string,
  profile?: string,
): { success: boolean; error?: string } {
  const filePath = memoryPath(profile);
  const existing = readFileSafe(filePath);
  const entries = parseMemoryEntries(existing.content);
  const newContent = serializeEntries([
    ...entries,
    { index: entries.length, content: content.trim() },
  ]);

  if (newContent.length > MEMORY_CHAR_LIMIT) {
    return {
      success: false,
      error: `Would exceed memory limit (${newContent.length}/${MEMORY_CHAR_LIMIT} chars)`,
    };
  }

  writeFileSafe(filePath, newContent);
  return { success: true };
}

export function updateMemoryEntry(
  index: number,
  content: string,
  profile?: string,
): { success: boolean; error?: string } {
  const filePath = memoryPath(profile);
  const existing = readFileSafe(filePath);
  const entries = parseMemoryEntries(existing.content);

  if (index < 0 || index >= entries.length) {
    return { success: false, error: "Entry not found" };
  }

  entries[index] = { ...entries[index], content: content.trim() };
  const newContent = serializeEntries(entries);

  if (newContent.length > MEMORY_CHAR_LIMIT) {
    return {
      success: false,
      error: `Would exceed memory limit (${newContent.length}/${MEMORY_CHAR_LIMIT} chars)`,
    };
  }

  writeFileSafe(filePath, newContent);
  return { success: true };
}

export function removeMemoryEntry(index: number, profile?: string): boolean {
  const filePath = memoryPath(profile);
  const existing = readFileSafe(filePath);
  const entries = parseMemoryEntries(existing.content);

  if (index < 0 || index >= entries.length) return false;

  entries.splice(index, 1);
  writeFileSafe(filePath, serializeEntries(entries));
  return true;
}

export function writeUserProfile(
  content: string,
  profile?: string,
): { success: boolean; error?: string } {
  if (content.length > USER_CHAR_LIMIT) {
    return {
      success: false,
      error: `Exceeds limit (${content.length}/${USER_CHAR_LIMIT} chars)`,
    };
  }
  writeFileSafe(userPath(profile), content);
  return { success: true };
}
