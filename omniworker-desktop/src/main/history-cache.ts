import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";

const DB_PATH = path.join(app.getPath("userData"), "history-cache.db");

export interface ConversationSummaryRow {
  id: string;
  summary: string;
  message_count: number;
  updated_at: string;
}

export class HistoryCache {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        summary TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );
  }

  getOrCreateSummary(conversationId: string): string | null {
    try {
      const row = this.db
        .prepare("SELECT summary FROM conversations WHERE id = ?")
        .get(conversationId) as { summary: string } | undefined;
      return row?.summary ?? null;
    } catch {
      return null;
    }
  }

  updateSummary(
    conversationId: string,
    summary: string,
    messageCount: number,
  ): void {
    try {
      this.db
        .prepare(
          `INSERT INTO conversations (id, summary, message_count, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             summary = excluded.summary,
             message_count = excluded.message_count,
             updated_at = excluded.updated_at`,
        )
        .run(conversationId, summary, messageCount);
    } catch {
      // best-effort cache; never block chat on cache failure
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore
    }
  }
}
