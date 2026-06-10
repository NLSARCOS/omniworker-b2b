/**
 * memory-engine.ts — Local SuperMemory Engine for OmniWorker Desktop
 *
 * Implements supermemory-like capabilities 100% locally:
 * - FactExtractor: regex + keyword patterns to extract facts from text
 * - ProfileBuilder: synthesizes static/dynamic user profiles from facts
 * - ContradictionResolver: detects and resolves fact contradictions
 * - DecayManager: expires temporal memories and decays old facts
 * - HybridRanker: combined BM25 + fact + recency scoring
 *
 * All storage is in the existing state.db (SQLite + FTS5).
 * No external APIs, no cloud, no LLM required.
 */

import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedFact {
  fact_type: string;
  subject: string;
  predicate: string;
  object: string | null;
  confidence: number;
  is_temporal: boolean;
  expires_at: number | null; // epoch seconds, null = permanent
}

export interface LocalProfile {
  static: string[];  // Long-term facts: name, preferences, stack
  dynamic: string[]; // Recent context: current project, active errors
}

export interface HybridSearchResult {
  id: number;
  content: string;
  snippet: string;
  type: string;
  session_id: string;
  created_at: string;
  score: number;
  source: "chunk" | "fact";
  age: string;
}

export interface FactNode {
  id: number;
  fact_type: string;
  subject: string;
  predicate: string;
  object: string | null;
  confidence: number;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  is_superseded: boolean;
}

export interface MemoryHealth {
  totalFacts: number;
  activeFacts: number;
  supersededFacts: number;
  temporalFacts: number;
  expiredFacts: number;
  totalChunks: number;
  oldestMemory: string | null;
  newestMemory: string | null;
  avgConfidence: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPORAL_KEYWORDS_ES = [
  "hoy", "mañana", "ayer", "esta semana", "este mes",
  "ahora mismo", "en este momento", "actualmente",
  "por ahora", "de momento", "temporalmente",
];

const TEMPORAL_KEYWORDS_EN = [
  "today", "tomorrow", "yesterday", "this week", "this month",
  "right now", "currently", "at the moment",
  "for now", "temporarily", "at present",
];

// How long temporal facts live before expiring (in seconds)
const TEMPORAL_EXPIRY_1D = 86400;       // "today", "tomorrow"
const TEMPORAL_EXPIRY_7D = 604800;      // "this week"
const TEMPORAL_EXPIRY_30D = 2592000;    // "this month"

// Decay: facts older than this lose confidence
const DECAY_THRESHOLD_DAYS = 30;
const DECAY_RATE = 0.02; // confidence reduction per day after threshold

// Profile: how many days of context for "dynamic" profile
const DYNAMIC_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// FactExtractor
// ---------------------------------------------------------------------------

/** Patterns for extracting structured facts from conversation text. */
const FACT_PATTERNS: Array<{
  fact_type: string;
  pattern: RegExp;
  subjectGroup: number;
  predicateFixed: string;
  objectGroup: number | null;
}> = [
  // Tech preferences: "I use/prefer/like X"
  {
    fact_type: "preference",
    pattern: /(?:I |yo |me )\s*(?:use|uso|prefer|prefiero|like|gusta|love|encanta)\s+([A-Za-z][A-Za-z0-9. _+-]{1,60})/gi,
    subjectGroup: 0,
    predicateFixed: "prefers",
    objectGroup: 1,
  },
  // Stack declarations: "we use X", "our stack is X"
  {
    fact_type: "tech_stack",
    pattern: /(?:we use|usamos|our stack (?:is|includes)|nuestro stack (?:es|incluye))\s+([A-Za-z][A-Za-z0-9., &+/-]{2,80})/gi,
    subjectGroup: 0,
    predicateFixed: "uses_stack",
    objectGroup: 1,
  },
  // Decisions: "decided to X", "going with X"
  {
    fact_type: "decision",
    pattern: /(?:decid(?:ed|imos|í) (?:to |que )?|going with |vamos con |elegimos |chosen |selected )\s*([^.!?\n]{5,120})/gi,
    subjectGroup: 0,
    predicateFixed: "decided",
    objectGroup: 1,
  },
  // Name/identity: "my name is X", "I'm X"
  {
    fact_type: "identity",
    pattern: /(?:my name is|me llamo|soy|I'?m)\s+([A-Z][a-zA-Záéíóúñ]{1,30}(?:\s[A-Z][a-zA-Záéíóúñ]{1,30})?)/g,
    subjectGroup: 0,
    predicateFixed: "name_is",
    objectGroup: 1,
  },
  // Location: "I live in X", "based in X"
  {
    fact_type: "location",
    pattern: /(?:I live in|vivo en|based in|ubicado en|from|de)\s+([A-Z][a-zA-Záéíóúñ, ]{2,50})/g,
    subjectGroup: 0,
    predicateFixed: "located_in",
    objectGroup: 1,
  },
  // Project context: "working on X", "building X"
  {
    fact_type: "project",
    pattern: /(?:working on|trabajando en|building|construyendo|developing|desarrollando)\s+([^.!?\n]{3,80})/gi,
    subjectGroup: 0,
    predicateFixed: "working_on",
    objectGroup: 1,
  },
  // Errors/bugs: "error: X", "bug in X"
  {
    fact_type: "error",
    pattern: /(?:error|bug|issue|problema|falla|crash)[:\s]+([^.!?\n]{10,150})/gi,
    subjectGroup: 0,
    predicateFixed: "encountered_error",
    objectGroup: 1,
  },
  // File edits: common file extensions
  {
    fact_type: "file_edit",
    pattern: /(?:edit(?:ed|ing)?|modifi(?:ed|cando)|changed?|cambi(?:é|ando))\s+([\w/.-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|css|html|md|json|yaml|prisma|sql))/gi,
    subjectGroup: 0,
    predicateFixed: "edited_file",
    objectGroup: 1,
  },
];

export class FactExtractor {
  /**
   * Extract structured facts from a block of text.
   * Returns deduplicated facts with confidence and temporal markers.
   */
  extract(text: string): ExtractedFact[] {
    if (!text || text.trim().length < 10) return [];

    const facts: ExtractedFact[] = [];
    const seen = new Set<string>();

    for (const pattern of FACT_PATTERNS) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const objectVal = pattern.objectGroup !== null
          ? (match[pattern.objectGroup] ?? "").trim()
          : null;

        if (!objectVal || objectVal.length < 2) continue;

        const key = `${pattern.fact_type}:${pattern.predicateFixed}:${objectVal.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const isTemporal = this._isTemporal(text, match.index);
        const expiresAt = isTemporal ? this._getExpiry(text, match.index) : null;

        facts.push({
          fact_type: pattern.fact_type,
          subject: "user",
          predicate: pattern.predicateFixed,
          object: objectVal,
          confidence: isTemporal ? 0.7 : 0.85,
          is_temporal: isTemporal,
          expires_at: expiresAt,
        });
      }
    }

    return facts;
  }

  private _isTemporal(text: string, matchIndex: number): boolean {
    // Check if any temporal keyword appears near the match (within 100 chars)
    const window = text.substring(
      Math.max(0, matchIndex - 100),
      Math.min(text.length, matchIndex + 100),
    ).toLowerCase();

    return [...TEMPORAL_KEYWORDS_ES, ...TEMPORAL_KEYWORDS_EN].some(
      (kw) => window.includes(kw),
    );
  }

  private _getExpiry(text: string, matchIndex: number): number {
    const window = text.substring(
      Math.max(0, matchIndex - 100),
      Math.min(text.length, matchIndex + 100),
    ).toLowerCase();

    const now = Date.now() / 1000;

    if (["hoy", "today", "ahora", "right now", "now"].some((k) => window.includes(k))) {
      return now + TEMPORAL_EXPIRY_1D;
    }
    if (["mañana", "tomorrow", "ayer", "yesterday"].some((k) => window.includes(k))) {
      return now + TEMPORAL_EXPIRY_1D;
    }
    if (["esta semana", "this week"].some((k) => window.includes(k))) {
      return now + TEMPORAL_EXPIRY_7D;
    }
    if (["este mes", "this month"].some((k) => window.includes(k))) {
      return now + TEMPORAL_EXPIRY_30D;
    }
    // Default temporal expiry: 7 days
    return now + TEMPORAL_EXPIRY_7D;
  }
}

// ---------------------------------------------------------------------------
// ContradictionResolver
// ---------------------------------------------------------------------------

export class ContradictionResolver {
  /**
   * Check if a new fact contradicts an existing one.
   * A contradiction = same (subject, predicate) but different object.
   * When detected, supersede the old fact.
   */
  resolveInDb(db: Database.Database, newFact: ExtractedFact): void {
    const existing = db
      .prepare(
        `SELECT id, object, confidence, occurrence_count
         FROM memory_facts
         WHERE subject = ? AND predicate = ? AND superseded_at IS NULL
         ORDER BY last_seen DESC
         LIMIT 1`,
      )
      .get(newFact.subject, newFact.predicate) as
      | { id: number; object: string | null; confidence: number; occurrence_count: number }
      | undefined;

    if (!existing) return;

    // Same fact, just boost occurrence
    if (
      existing.object?.toLowerCase() === newFact.object?.toLowerCase()
    ) {
      db.prepare(
        `UPDATE memory_facts
         SET occurrence_count = occurrence_count + 1,
             last_seen = ?,
             confidence = MIN(1.0, confidence + 0.05)
         WHERE id = ?`,
      ).run(Date.now() / 1000, existing.id);
      return;
    }

    // Different object → contradiction! Supersede the old one.
    db.prepare(
      `UPDATE memory_facts SET superseded_at = ?, confidence = confidence * 0.5 WHERE id = ?`,
    ).run(Date.now() / 1000, existing.id);
  }
}

// ---------------------------------------------------------------------------
// DecayManager
// ---------------------------------------------------------------------------

export class DecayManager {
  /**
   * Run decay pass: reduce confidence of old facts, delete expired temporals.
   * Should be called periodically (e.g., on app startup or every few hours).
   */
  runDecay(db: Database.Database): { decayed: number; expired: number } {
    const now = Date.now() / 1000;
    const thresholdTs = now - DECAY_THRESHOLD_DAYS * 86400;

    // 1. Expire temporal facts past their expiry date
    const expireResult = db
      .prepare(
        `UPDATE memory_facts
         SET superseded_at = ?, confidence = 0
         WHERE expires_at IS NOT NULL AND expires_at < ? AND superseded_at IS NULL`,
      )
      .run(now, now);

    // 2. Decay old facts (reduce confidence gradually)
    const oldFacts = db
      .prepare(
        `SELECT id, last_seen, confidence
         FROM memory_facts
         WHERE last_seen < ? AND superseded_at IS NULL AND confidence > 0.1`,
      )
      .all(thresholdTs) as Array<{ id: number; last_seen: number; confidence: number }>;

    let decayed = 0;
    const updateStmt = db.prepare(
      `UPDATE memory_facts SET confidence = ? WHERE id = ?`,
    );

    for (const fact of oldFacts) {
      const daysOld = (now - fact.last_seen) / 86400;
      const daysPastThreshold = daysOld - DECAY_THRESHOLD_DAYS;
      const newConfidence = Math.max(0.1, fact.confidence - daysPastThreshold * DECAY_RATE);
      if (newConfidence < fact.confidence) {
        updateStmt.run(newConfidence, fact.id);
        decayed++;
      }
    }

    return { decayed, expired: expireResult.changes };
  }
}

// ---------------------------------------------------------------------------
// ProfileBuilder
// ---------------------------------------------------------------------------

export class ProfileBuilder {
  /**
   * Build a local user profile from facts in the DB.
   * Static = permanent facts (high confidence, not temporal)
   * Dynamic = recent facts from the last 7 days
   */
  build(db: Database.Database): LocalProfile {
    const now = Date.now() / 1000;
    const dynamicCutoff = now - DYNAMIC_WINDOW_DAYS * 86400;

    // Static: high-confidence, non-temporal, non-superseded facts
    const staticFacts = db
      .prepare(
        `SELECT fact_type, subject, predicate, object
         FROM memory_facts
         WHERE superseded_at IS NULL
           AND confidence >= 0.5
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY occurrence_count DESC, confidence DESC
         LIMIT 30`,
      )
      .all(now) as Array<{ fact_type: string; subject: string; predicate: string; object: string | null }>;

    // Dynamic: recent facts (last 7 days), regardless of confidence
    const dynamicFacts = db
      .prepare(
        `SELECT fact_type, subject, predicate, object
         FROM memory_facts
         WHERE last_seen > ?
           AND superseded_at IS NULL
         ORDER BY last_seen DESC
         LIMIT 15`,
      )
      .all(dynamicCutoff) as Array<{ fact_type: string; subject: string; predicate: string; object: string | null }>;

    return {
      static: staticFacts.map((f) => this._formatFact(f)),
      dynamic: dynamicFacts.map((f) => this._formatFact(f)),
    };
  }

  private _formatFact(f: { fact_type: string; predicate: string; object: string | null }): string {
    const predicateMap: Record<string, string> = {
      prefers: "Prefers",
      uses_stack: "Uses",
      decided: "Decided to",
      name_is: "Name is",
      located_in: "Located in",
      working_on: "Working on",
      encountered_error: "Error",
      edited_file: "Edited",
    };
    const prefix = predicateMap[f.predicate] || f.predicate;
    return `${prefix}: ${f.object || "?"}`;
  }
}

// ---------------------------------------------------------------------------
// HybridRanker
// ---------------------------------------------------------------------------

/** Weights for hybrid scoring */
const W_BM25 = 0.45;
const W_RECENCY = 0.30;
const W_FACT_BOOST = 0.25;

export class HybridRanker {
  /**
   * Hybrid search: combine FTS5 chunk search + fact search + recency.
   * Returns merged, deduplicated, scored results.
   */
  search(
    db: Database.Database,
    query: string,
    limit = 20,
  ): HybridSearchResult[] {
    if (!query || query.trim().length < 2) return [];

    const results: HybridSearchResult[] = [];
    const now = Date.now() / 1000;

    // 1. FTS5 chunk search
    try {
      const ftsQuery = this._sanitizeFtsQuery(query);
      if (ftsQuery) {
        const chunkRows = db
          .prepare(
            `SELECT c.id, c.session_id, c.chunk_type, c.content, c.created_at,
                    rank AS bm25_rank
             FROM memory_chunks_fts f
             JOIN memory_chunks c ON c.id = f.rowid
             WHERE memory_chunks_fts MATCH ?
             ORDER BY rank
             LIMIT ?`,
          )
          .all(ftsQuery, limit) as any[];

        for (const row of chunkRows) {
          const ageHours = (now - row.created_at) / 3600;
          const recencyScore = Math.max(0, 1 - ageHours / (30 * 24)); // 0-1, decays over 30 days
          const bm25Score = Math.min(1, Math.abs(row.bm25_rank || 0) / 20); // normalize rank
          const score = W_BM25 * bm25Score + W_RECENCY * recencyScore;

          results.push({
            id: row.id,
            content: row.content,
            snippet: row.content.substring(0, 200),
            type: row.chunk_type,
            session_id: row.session_id,
            created_at: new Date(row.created_at * 1000).toISOString(),
            score,
            source: "chunk",
            age: this._formatAge(ageHours),
          });
        }
      }
    } catch (err) {
      // FTS5 search failed, try LIKE fallback
      try {
        const likeQuery = `%${query.trim()}%`;
        const fallbackRows = db
          .prepare(
            `SELECT id, session_id, chunk_type, content, created_at
             FROM memory_chunks
             WHERE content LIKE ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(likeQuery, limit) as any[];

        for (const row of fallbackRows) {
          const ageHours = (now - row.created_at) / 3600;
          results.push({
            id: row.id,
            content: row.content,
            snippet: row.content.substring(0, 200),
            type: row.chunk_type,
            session_id: row.session_id,
            created_at: new Date(row.created_at * 1000).toISOString(),
            score: W_RECENCY * Math.max(0, 1 - ageHours / (30 * 24)),
            source: "chunk",
            age: this._formatAge(ageHours),
          });
        }
      } catch (err) {
        console.warn("[SuperMemory] chunk search failed (FTS5 and LIKE):", err);
      }
    }

    // 2. Fact search (LIKE on subject/predicate/object)
    try {
      const factLike = `%${query.trim()}%`;
      const factRows = db
        .prepare(
          `SELECT id, fact_type, subject, predicate, object, confidence, last_seen,
                  occurrence_count
           FROM memory_facts
           WHERE superseded_at IS NULL
             AND (subject LIKE ? OR predicate LIKE ? OR object LIKE ?)
           ORDER BY confidence DESC, last_seen DESC
           LIMIT ?`,
        )
        .all(factLike, factLike, factLike, Math.min(limit, 10)) as any[];

      for (const f of factRows) {
        const ageHours = f.last_seen ? (now - f.last_seen) / 3600 : 999;
        const recencyScore = Math.max(0, 1 - ageHours / (30 * 24));
        const factBoost = f.confidence * (Math.min(f.occurrence_count, 5) / 5);
        const score = W_FACT_BOOST * factBoost + W_RECENCY * recencyScore;
        const content = `${f.subject} ${f.predicate}${f.object ? " → " + f.object : ""}`;

        results.push({
          id: f.id + 1_000_000, // offset to avoid ID collision with chunks
          content,
          snippet: content,
          type: `fact:${f.fact_type}`,
          session_id: "",
          created_at: f.last_seen ? new Date(f.last_seen * 1000).toISOString() : "",
          score,
          source: "fact",
          age: this._formatAge(ageHours),
        });
      }
    } catch (err) {
      console.warn("[SuperMemory] fact search failed:", err);
    }

    // 3. Sort by combined score descending, deduplicate
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private _sanitizeFtsQuery(query: string): string {
    const tokens = query
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 1);
    if (tokens.length === 0) return "";
    return tokens.map((t) => `"${t}"*`).join(" ");
  }

  private _formatAge(ageHours: number): string {
    if (ageHours < 1) return "just now";
    if (ageHours < 24) return `${Math.floor(ageHours)}h ago`;
    if (ageHours < 720) return `${Math.floor(ageHours / 24)}d ago`;
    return `${Math.floor(ageHours / 720)}mo ago`;
  }
}

// ---------------------------------------------------------------------------
// Schema Migration
// ---------------------------------------------------------------------------

/**
 * Ensure the memory_facts table has SuperMemory columns.
 * Idempotent — safe to call on every startup.
 */
export function ensureSuperMemorySchema(db: Database.Database): void {
  // Old installs may not have memory_facts at all (it normally comes from
  // ensureNativeMemoryTables in memory.ts, but not every caller goes through
  // that path). Base schema kept in lockstep with memory.ts and the agent's
  // native_memory.py.
  try {
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
  } catch (err) {
    console.warn("[SuperMemory] could not ensure memory_facts table:", err);
  }

  // Add SuperMemory-specific columns to memory_facts if missing
  const additions = [
    "ALTER TABLE memory_facts ADD COLUMN superseded_at REAL",
    "ALTER TABLE memory_facts ADD COLUMN expires_at REAL",
    "ALTER TABLE memory_facts ADD COLUMN is_temporal INTEGER NOT NULL DEFAULT 0",
  ];
  for (const sql of additions) {
    try {
      db.exec(sql);
    } catch (err) {
      // "duplicate column name" is the expected idempotent case; anything
      // else means the migration actually failed and must not stay silent.
      if (!String(err).toLowerCase().includes("duplicate column")) {
        console.warn("[SuperMemory] schema migration step failed:", sql, err);
      }
    }
  }

  // Create index for superseded lookup
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_memory_facts_active
       ON memory_facts(subject, predicate)
       WHERE superseded_at IS NULL`,
    );
  } catch {
    // Index exists
  }

  // Create index for temporal expiry
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_memory_facts_expires
       ON memory_facts(expires_at)
       WHERE expires_at IS NOT NULL`,
    );
  } catch {
    // Index exists
  }
}

// ---------------------------------------------------------------------------
// Main Engine Class
// ---------------------------------------------------------------------------

export class LocalMemoryEngine {
  private extractor: FactExtractor;
  private resolver: ContradictionResolver;
  private decay: DecayManager;
  private profiler: ProfileBuilder;
  private ranker: HybridRanker;

  constructor() {
    this.extractor = new FactExtractor();
    this.resolver = new ContradictionResolver();
    this.decay = new DecayManager();
    this.profiler = new ProfileBuilder();
    this.ranker = new HybridRanker();
  }

  /**
   * Ingest a batch of conversation messages into the memory engine.
   * Extracts facts, resolves contradictions, stores everything.
   */
  ingest(
    db: Database.Database,
    messages: Array<{ role: string; content: string }>,
    sessionId: string,
  ): { chunksStored: number; factsExtracted: number } {
    ensureSuperMemorySchema(db);

    const now = Date.now() / 1000;
    let chunksStored = 0;
    let factsExtracted = 0;

    const insertChunk = db.prepare(
      `INSERT INTO memory_chunks (session_id, turn_id, chunk_type, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    const insertFact = db.prepare(
      `INSERT INTO memory_facts (session_id, fact_type, subject, predicate, object,
                                 confidence, occurrence_count, first_seen, last_seen,
                                 is_temporal, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    );

    const transaction = db.transaction(() => {
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg.content || msg.content.trim().length < 10) continue;

        // Store as chunk
        insertChunk.run(sessionId, i, msg.role, msg.content.trim(), now);
        chunksStored++;

        // Extract facts (mainly from user messages, but also assistant decisions)
        if (msg.role === "user" || msg.role === "assistant") {
          const facts = this.extractor.extract(msg.content);
          for (const fact of facts) {
            // Resolve contradictions first
            this.resolver.resolveInDb(db, fact);

            // Insert new fact
            insertFact.run(
              sessionId,
              fact.fact_type,
              fact.subject,
              fact.predicate,
              fact.object,
              fact.confidence,
              now,
              now,
              fact.is_temporal ? 1 : 0,
              fact.expires_at,
            );
            factsExtracted++;
          }
        }
      }
    });

    transaction();
    return { chunksStored, factsExtracted };
  }

  /**
   * Get synthesized local profile.
   */
  getProfile(db: Database.Database): LocalProfile {
    ensureSuperMemorySchema(db);
    return this.profiler.build(db);
  }

  /**
   * Hybrid search across chunks and facts.
   */
  search(db: Database.Database, query: string, limit = 20): HybridSearchResult[] {
    return this.ranker.search(db, query, limit);
  }

  /**
   * Get all active facts as a graph.
   */
  getFactGraph(db: Database.Database): FactNode[] {
    ensureSuperMemorySchema(db);

    try {
      const rows = db
        .prepare(
          `SELECT id, fact_type, subject, predicate, object, confidence,
                  occurrence_count, first_seen, last_seen,
                  CASE WHEN superseded_at IS NOT NULL THEN 1 ELSE 0 END as is_superseded
           FROM memory_facts
           ORDER BY
             CASE WHEN superseded_at IS NULL THEN 0 ELSE 1 END,
             confidence DESC,
             last_seen DESC
           LIMIT 100`,
        )
        .all() as any[];

      // first_seen/last_seen can be NULL in old DBs — new Date(null * 1000)
      // yields an Invalid Date whose toISOString() throws and crashes the
      // IPC handler.
      const toIso = (ts: unknown): string =>
        typeof ts === "number" && Number.isFinite(ts)
          ? new Date(ts * 1000).toISOString()
          : "";
      return rows.map((r) => ({
        id: r.id,
        fact_type: r.fact_type,
        subject: r.subject,
        predicate: r.predicate,
        object: r.object,
        confidence: r.confidence,
        occurrence_count: r.occurrence_count,
        first_seen: toIso(r.first_seen),
        last_seen: toIso(r.last_seen),
        is_superseded: r.is_superseded === 1,
      }));
    } catch (err) {
      console.warn("[SuperMemory] getFactGraph failed:", err);
      return [];
    }
  }

  /**
   * Get memory health stats.
   */
  getHealth(db: Database.Database): MemoryHealth {
    ensureSuperMemorySchema(db);
    const now = Date.now() / 1000;

    try {
      const totalFacts = (db.prepare("SELECT COUNT(*) as c FROM memory_facts").get() as any)?.c ?? 0;
      const activeFacts = (db.prepare("SELECT COUNT(*) as c FROM memory_facts WHERE superseded_at IS NULL").get() as any)?.c ?? 0;
      const supersededFacts = (db.prepare("SELECT COUNT(*) as c FROM memory_facts WHERE superseded_at IS NOT NULL").get() as any)?.c ?? 0;
      const temporalFacts = (db.prepare("SELECT COUNT(*) as c FROM memory_facts WHERE is_temporal = 1 AND superseded_at IS NULL").get() as any)?.c ?? 0;
      const expiredFacts = (db.prepare("SELECT COUNT(*) as c FROM memory_facts WHERE expires_at IS NOT NULL AND expires_at < ?").get(now) as any)?.c ?? 0;
      const totalChunks = (db.prepare("SELECT COUNT(*) as c FROM memory_chunks").get() as any)?.c ?? 0;
      const oldest = (db.prepare("SELECT MIN(created_at) as t FROM memory_chunks").get() as any)?.t;
      const newest = (db.prepare("SELECT MAX(created_at) as t FROM memory_chunks").get() as any)?.t;
      const avgConf = (db.prepare("SELECT AVG(confidence) as a FROM memory_facts WHERE superseded_at IS NULL").get() as any)?.a ?? 0;

      return {
        totalFacts,
        activeFacts,
        supersededFacts,
        temporalFacts,
        expiredFacts,
        totalChunks,
        oldestMemory: oldest ? new Date(oldest * 1000).toISOString() : null,
        newestMemory: newest ? new Date(newest * 1000).toISOString() : null,
        avgConfidence: Math.round(avgConf * 100) / 100,
      };
    } catch {
      return {
        totalFacts: 0, activeFacts: 0, supersededFacts: 0, temporalFacts: 0,
        expiredFacts: 0, totalChunks: 0, oldestMemory: null, newestMemory: null,
        avgConfidence: 0,
      };
    }
  }

  /**
   * Run memory maintenance: decay old facts, expire temporals.
   */
  runMaintenance(db: Database.Database): { decayed: number; expired: number } {
    ensureSuperMemorySchema(db);
    return this.decay.runDecay(db);
  }
}
