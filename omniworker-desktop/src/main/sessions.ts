import Database from "better-sqlite3";
import { join } from "path";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { OMNIWORKER_HOME } from "./installer";
import { activeStateDbPath } from "./utils";
import { clearStagedAttachments } from "./attachment-staging";
import { removeSessionFromCache } from "./session-cache";
import { deletePromptImageAttachmentsForSession } from "./session-attachment-store";

function getCronOutputMessage(sessionId: string): SessionMessage | null {
  const match = /^cron_([^_]+)_/.exec(sessionId);
  if (!match) return null;

  const outputDir = join(OMNIWORKER_HOME, "cron", "output", match[1]);
  if (!existsSync(outputDir)) return null;

  try {
    const files = readdirSync(outputDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => join(outputDir, name))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (files.length === 0) return null;

    const stat = statSync(files[0]);
    return {
      id: Number.MAX_SAFE_INTEGER,
      role: "assistant",
      content: readFileSync(files[0], "utf-8"),
      timestamp: stat.mtimeMs / 1000,
    };
  } catch {
    return null;
  }
}

export interface SessionSummary {
  id: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  title: string | null;
  preview: string;
}

export interface SessionMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
}

export interface SearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}

function getDb(readonly = true): Database.Database | null {
  const dbPath = activeStateDbPath();
  if (!existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly });
}

export function listSessions(limit = 30, offset = 0): SessionSummary[] {
  const db = getDb();
  if (!db) return [];

  try {
    // Simple query without correlated subquery — titles come from session cache
    const rows = db
      .prepare(
        `SELECT
          s.id,
          s.source,
          s.started_at,
          s.ended_at,
          s.message_count,
          s.model,
          s.title
        FROM sessions s
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as Array<{
      id: string;
      source: string;
      started_at: number;
      ended_at: number | null;
      message_count: number;
      model: string;
      title: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      messageCount: r.message_count,
      model: r.model || "",
      title: r.title,
      preview: "",
    }));
  } finally {
    db.close();
  }
}

export function searchSessions(query: string, limit = 20): SearchResult[] {
  const db = getDb();
  if (!db) return [];

  try {
    // Check if FTS table exists
    const tableCheck = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { name: string } | undefined;

    if (!tableCheck) return [];

    // Sanitize query for FTS5: wrap each word with quotes for safety, add * for prefix
    const sanitized = query
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w.replace(/"/g, "")}"*`)
      .join(" ");

    if (!sanitized) return [];

    const rows = db
      .prepare(
        `SELECT DISTINCT
          m.session_id,
          s.title,
          s.started_at,
          s.source,
          s.message_count,
          s.model,
          snippet(messages_fts, 0, '<<', '>>', '...', 40) as snippet
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.rowid
        JOIN sessions s ON s.id = m.session_id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?`,
      )
      .all(sanitized, limit) as Array<{
      session_id: string;
      title: string | null;
      started_at: number;
      source: string;
      message_count: number;
      model: string;
      snippet: string;
    }>;

    return rows.map((r) => ({
      sessionId: r.session_id,
      title: r.title,
      startedAt: r.started_at,
      source: r.source,
      messageCount: r.message_count,
      model: r.model || "",
      snippet: r.snippet || "",
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export function getSessionMessages(sessionId: string): SessionMessage[] {
  const db = getDb();
  if (!db) return [];

  try {
    const rows = db
      .prepare(
        `SELECT id, role, content, timestamp
         FROM messages
         WHERE session_id = ? AND role IN ('user', 'assistant') AND content IS NOT NULL
         ORDER BY timestamp, id`,
      )
      .all(sessionId) as Array<{
      id: number;
      role: string;
      content: string;
      timestamp: number;
    }>;

    const messages: SessionMessage[] = rows.map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      timestamp: r.timestamp,
    }));

    if (
      sessionId.startsWith("cron_") &&
      !messages.some((m) => m.role === "assistant" && m.content.trim())
    ) {
      const cronOutput = getCronOutputMessage(sessionId);
      if (cronOutput) messages.push(cronOutput);
    }

    return messages;
  } finally {
    db.close();
  }
}

export interface DeleteSessionsResult {
  requested: number;
  deleted: number;
}

function normalizeSessionIds(sessionIds: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const id of sessionIds) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function deleteSessionRows(db: Database.Database, sessionId: string): number {
  deletePromptImageAttachmentsForSession(db, sessionId);
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  return result.changes;
}

function cleanupDeletedSession(sessionId: string): void {
  clearStagedAttachments(sessionId);
  removeSessionFromCache(sessionId);
}

export function deleteSession(sessionId: string): void {
  const id = normalizeSessionIds([sessionId])[0];
  if (!id) return;

  const db = getDb(false);

  if (db) {
    try {
      const tx = db.transaction((sessionIdToDelete: string) => {
        deleteSessionRows(db, sessionIdToDelete);
      });
      tx(id);
    } finally {
      db.close();
    }
  }

  cleanupDeletedSession(id);
}

export function deleteSessions(sessionIds: string[]): DeleteSessionsResult {
  const ids = normalizeSessionIds(sessionIds);
  let deleted = 0;

  const db = getDb(false);

  if (db) {
    try {
      const tx = db.transaction((idsToDelete: string[]) => {
        for (const id of idsToDelete) {
          deleted += deleteSessionRows(db, id);
        }
      });
      tx(ids);
    } finally {
      db.close();
    }
  }

  for (const id of ids) {
    cleanupDeletedSession(id);
  }

  return { requested: ids.length, deleted };
}
