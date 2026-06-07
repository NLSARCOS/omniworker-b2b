import { existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { profileHome, profilePaths, safeWriteFile } from "./utils";

const MEMORY_CHAR_LIMIT = 50_000; // was 2200 — too small for real memory
const USER_CHAR_LIMIT = 10_000;

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
  stats: {
    totalSessions: number;
    totalMessages: number;
    memoryChunks: number;
    memoryFacts: number;
  };
}

function memoryPath(profile?: string): string {
  return join(profileHome(profile), "memories", "MEMORY.md");
}

function userPath(profile?: string): string {
  return join(profileHome(profile), "memories", "USER.md");
}

function stateDbPath(profile?: string): string {
  return join(profileHome(profile), "state.db");
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

// ── NativeMemory Tables Check ──────────────────────────

function nativeMemoryTablesExist(db: Database.Database): boolean {
  try {
    const row = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name IN ('memory_chunks', 'memory_facts')"
      )
      .get() as { cnt: number } | undefined;
    return (row?.cnt ?? 0) >= 1;
  } catch {
    return false;
  }
}

function ensureNativeMemoryTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_chunks (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL DEFAULT '',
      turn_id INTEGER NOT NULL DEFAULT 0,
      chunk_type TEXT NOT NULL DEFAULT 'manual',
      content TEXT NOT NULL,
      metadata TEXT,
      created_at REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_session
      ON memory_chunks(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_type
      ON memory_chunks(chunk_type);
  `);
  // Create FTS5 virtual table if not exists
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_chunks_fts USING fts5(
        content, tokenize='trigram'
      );
    `);
  } catch {
    // FTS5 might already exist, ignore
  }
  // Create trigger for auto-indexing
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS memory_chunks_fts_insert
      AFTER INSERT ON memory_chunks BEGIN
        INSERT INTO memory_chunks_fts(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS memory_chunks_fts_delete
      AFTER DELETE ON memory_chunks BEGIN
        DELETE FROM memory_chunks_fts WHERE rowid = old.id;
      END;
    `);
  } catch {
    // Triggers might already exist
  }
  // Create facts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_facts (
      id INTEGER PRIMARY KEY,
      session_id TEXT,
      fact_type TEXT NOT NULL DEFAULT 'general',
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT,
      confidence REAL DEFAULT 1.0,
      occurrence_count INTEGER DEFAULT 1,
      first_seen REAL,
      last_seen REAL
    );
  `);
}

function openStateDb(profile?: string, readonly = true): Database.Database | null {
  const dbPath = stateDbPath(profile);
  if (!existsSync(dbPath)) return null;
  try {
    const db = new Database(dbPath, { readonly });
    db.pragma("journal_mode = WAL");
    return db;
  } catch (err) {
    console.error("[memory] Failed to open state.db:", err);
    return null;
  }
}

// ── FTS5 Query Sanitization ────────────────────────────

function sanitizeFtsQuery(query: string): string {
  if (!query || !query.trim()) return "";
  // Split into tokens, wrap each in quotes for safe FTS5 matching
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `"${t}"*`).join(" ");
}

// ── Stats ─────────────────────────────────────────────

function getSessionStats(profile?: string): {
  totalSessions: number;
  totalMessages: number;
  memoryChunks: number;
  memoryFacts: number;
} {
  const db = openStateDb(profile, true);
  if (!db) {
    return { totalSessions: 0, totalMessages: 0, memoryChunks: 0, memoryFacts: 0 };
  }

  try {
    const sessionRow = db
      .prepare("SELECT COUNT(*) as count FROM sessions")
      .get() as { count: number } | undefined;
    const messageRow = db
      .prepare("SELECT COUNT(*) as count FROM messages")
      .get() as { count: number } | undefined;

    let memoryChunks = 0;
    let memoryFacts = 0;
    if (nativeMemoryTablesExist(db)) {
      const chunkRow = db
        .prepare("SELECT COUNT(*) as count FROM memory_chunks")
        .get() as { count: number } | undefined;
      memoryChunks = chunkRow?.count ?? 0;
      const factRow = db
        .prepare("SELECT COUNT(*) as count FROM memory_facts")
        .get() as { count: number } | undefined;
      memoryFacts = factRow?.count ?? 0;
    }

    return {
      totalSessions: sessionRow?.count ?? 0,
      totalMessages: messageRow?.count ?? 0,
      memoryChunks,
      memoryFacts,
    };
  } catch (err) {
    console.error("[memory] getSessionStats failed:", err);
    return { totalSessions: 0, totalMessages: 0, memoryChunks: 0, memoryFacts: 0 };
  } finally {
    db.close();
  }
}

// ── Engram Binary & Bootstrap ────────────────────────

export async function bootstrapEngram(
  _onProgress?: (detail: string, step: number) => void,
): Promise<boolean> {
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

    // 1. Write to MEMORY.md (legacy, still used by agent)
    const existing = readFileSafe(filePath);
    const entries = parseMemoryEntries(existing.content);
    const newContent = serializeEntries([
      ...entries,
      { index: entries.length, content: content.trim() },
    ]);
    writeFileSafe(filePath, newContent);

    // 2. Also store in NativeMemory chunks table for FTS5 searchability
    try {
      const db = openStateDb(profile, false);
      if (db) {
        try {
          ensureNativeMemoryTables(db);
          db.prepare(
            "INSERT INTO memory_chunks (session_id, turn_id, chunk_type, content, created_at) VALUES (?, ?, ?, ?, ?)"
          ).run("desktop-manual", 0, "manual", content.trim(), Date.now() / 1000);
        } finally {
          db.close();
        }
      }
    } catch (dbErr) {
      // DB write is best-effort — MEMORY.md is the source of truth
      console.warn("[memory] Failed to index chunk in state.db:", dbErr);
    }

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

// ── NativeMemory Search & Timeline (Real Implementation) ──────

export async function searchObservations(
  query: string,
  limit = 20,
  _project = "omniworker",
  _scope = "personal",
): Promise<any[]> {
  if (!query || !query.trim()) return [];

  const db = openStateDb(undefined, true);
  if (!db) return [];

  try {
    if (!nativeMemoryTablesExist(db)) return [];

    const ftsQuery = sanitizeFtsQuery(query);
    if (!ftsQuery) return [];

    const results: any[] = [];

    // 1. Search memory chunks via FTS5
    try {
      const rows = db
        .prepare(
          `SELECT c.id, c.session_id, c.chunk_type, c.content, c.created_at,
                  snippet(memory_chunks_fts, 0, '<<', '>>', '...', 32) as snippet
           FROM memory_chunks_fts f
           JOIN memory_chunks c ON c.id = f.rowid
           WHERE memory_chunks_fts MATCH ?
           ORDER BY c.created_at DESC
           LIMIT ?`
        )
        .all(ftsQuery, limit) as any[];

      for (const row of rows) {
        const ageHours = (Date.now() / 1000 - row.created_at) / 3600;
        let ageLabel = "";
        if (ageHours < 1) ageLabel = "just now";
        else if (ageHours < 24) ageLabel = `${Math.floor(ageHours)}h ago`;
        else ageLabel = `${Math.floor(ageHours / 24)}d ago`;

        results.push({
          id: row.id,
          content: row.content,
          snippet: row.snippet,
          type: row.chunk_type,
          session_id: row.session_id,
          created_at: new Date(row.created_at * 1000).toISOString(),
          age: ageLabel,
        });
      }
    } catch (ftsErr) {
      console.warn("[memory] FTS5 search failed, trying LIKE fallback:", ftsErr);
      // Fallback: basic LIKE search
      const likeQuery = `%${query.trim()}%`;
      const rows = db
        .prepare(
          `SELECT id, session_id, chunk_type, content, created_at
           FROM memory_chunks
           WHERE content LIKE ?
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .all(likeQuery, limit) as any[];

      for (const row of rows) {
        results.push({
          id: row.id,
          content: row.content,
          snippet: row.content.substring(0, 200),
          type: row.chunk_type,
          session_id: row.session_id,
          created_at: new Date(row.created_at * 1000).toISOString(),
        });
      }
    }

    // 2. Also search memory_facts
    try {
      const factLike = `%${query.trim()}%`;
      const facts = db
        .prepare(
          `SELECT id, fact_type, subject, predicate, object, confidence, last_seen
           FROM memory_facts
           WHERE subject LIKE ? OR predicate LIKE ? OR object LIKE ?
           ORDER BY last_seen DESC
           LIMIT ?`
        )
        .all(factLike, factLike, factLike, Math.min(limit, 10)) as any[];

      for (const f of facts) {
        results.push({
          id: `fact-${f.id}`,
          content: `${f.subject} ${f.predicate}${f.object ? " → " + f.object : ""}`,
          snippet: `${f.subject} ${f.predicate}${f.object ? " → " + f.object : ""}`,
          type: `fact:${f.fact_type}`,
          session_id: "",
          created_at: f.last_seen ? new Date(f.last_seen * 1000).toISOString() : "",
          confidence: f.confidence,
        });
      }
    } catch {
      // facts table might not exist yet
    }

    return results;
  } catch (err) {
    console.error("[memory] searchObservations failed:", err);
    return [];
  } finally {
    db.close();
  }
}

export async function getTimeline(
  observationId?: number,
  before = 5,
  after = 5,
): Promise<any> {
  if (!observationId) {
    return { focus: null, before: [], after: [], total_in_range: 0 };
  }

  const db = openStateDb(undefined, true);
  if (!db) {
    return { focus: null, before: [], after: [], total_in_range: 0 };
  }

  try {
    if (!nativeMemoryTablesExist(db)) {
      return { focus: null, before: [], after: [], total_in_range: 0 };
    }

    // Get the focus chunk
    const focusRow = db
      .prepare(
        "SELECT id, session_id, chunk_type, content, created_at FROM memory_chunks WHERE id = ?"
      )
      .get(observationId) as any;

    if (!focusRow) {
      return { focus: null, before: [], after: [], total_in_range: 0 };
    }

    const focus = {
      id: focusRow.id,
      title: focusRow.chunk_type,
      content: focusRow.content,
      type: focusRow.chunk_type,
      created_at: new Date(focusRow.created_at * 1000).toISOString(),
    };

    // Get chunks before (older)
    const beforeRows = db
      .prepare(
        `SELECT id, session_id, chunk_type, content, created_at
         FROM memory_chunks
         WHERE created_at < (SELECT created_at FROM memory_chunks WHERE id = ?)
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(observationId, before) as any[];

    // Get chunks after (newer)
    const afterRows = db
      .prepare(
        `SELECT id, session_id, chunk_type, content, created_at
         FROM memory_chunks
         WHERE created_at > (SELECT created_at FROM memory_chunks WHERE id = ?)
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .all(observationId, after) as any[];

    const mapEntry = (row: any) => ({
      id: row.id,
      session_id: row.session_id,
      type: row.chunk_type,
      title: row.chunk_type,
      content: row.content,
      scope: "project",
      revision_count: 0,
      duplicate_count: 0,
      created_at: new Date(row.created_at * 1000).toISOString(),
      updated_at: new Date(row.created_at * 1000).toISOString(),
    });

    return {
      focus,
      before: beforeRows.map(mapEntry),
      after: afterRows.map(mapEntry),
      total_in_range: beforeRows.length + 1 + afterRows.length,
    };
  } catch (err) {
    console.error("[memory] getTimeline failed:", err);
    return { focus: null, before: [], after: [], total_in_range: 0 };
  } finally {
    db.close();
  }
}

export async function getConflicts(
  _project = "omniworker",
  _status = "pending",
  _limit = 50,
): Promise<any> {
  // Conflicts are an Engram P2P feature — not applicable to NativeMemory.
  // Return empty but valid structure so the UI renders cleanly.
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
