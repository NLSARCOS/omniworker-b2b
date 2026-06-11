// src/main/localMemoryStatus.ts
//
// Surfaces the health of the local SuperMemory engine to the renderer so the
// user gets a visible warning when their conversations are NOT being
// persisted locally. Triggered when:
//   - state.db does not exist (the Python agent never created it)
//   - the agent process is not running (only matters in local mode)
//   - the local DB schema is missing the native memory tables
//
// This is the missing piece behind the "users updating the app don't have
// local memory activated" report: the UI never knew, so the user never knew.

import { existsSync, statSync } from "fs";
import { getConnectionConfig } from "./config";
import { stateDbPath } from "./memory";
import { profileHome } from "./utils";
import { isRemoteMode, isGatewayRunning } from "./omniworker";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);

export type LocalMemoryHealth = "ok" | "agent_offline" | "db_missing" | "db_stale" | "schema_missing";

export interface LocalMemoryStatus {
  /** Quick bucket describing the state of local memory */
  health: LocalMemoryHealth;
  /** Path to state.db, or null if it doesn't exist */
  dbPath: string | null;
  /** state.db size in bytes, or 0 if it doesn't exist */
  dbSize: number;
  /** True if the local agent is currently running (local mode only) */
  agentRunning: boolean;
  /** True if the user is in remote/SSH mode (local memory intentionally off) */
  remoteMode: boolean;
  /** True if state.db has the SuperMemory native tables */
  schemaPresent: boolean;
  /** Human-readable message safe to show the user */
  message: string;
  /** True when local memory is working correctly (in local mode) */
  isHealthy: boolean;
  /** Number of memory chunks currently stored */
  chunkCount: number;
  /** Number of memory facts currently stored */
  factCount: number;
}

let cached: { status: LocalMemoryStatus; ts: number } | null = null;
const CACHE_TTL_MS = 3000; // don't re-stat more than every 3s — this is called on UI ticks

/**
 * Probe state.db directly to verify the SuperMemory tables exist. We open
 * the DB read-only so we never block the agent's writer.
 */
async function probeSchema(): Promise<{ present: boolean; chunkCount: number; factCount: number }> {
  const dbPath = stateDbPath();
  if (!existsSync(dbPath)) {
    return { present: false, chunkCount: 0, factCount: 0 };
  }
  let Database: any;
  try {
    Database = (await import("better-sqlite3")).default;
  } catch {
    return { present: false, chunkCount: 0, factCount: 0 };
  }
  let db: any;
  try {
    db = new Database(dbPath, { readonly: true, timeout: 2000 });
  } catch {
    return { present: false, chunkCount: 0, factCount: 0 };
  }
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('memory_chunks','memory_facts','sessions')")
      .all() as Array<{ name: string }>;
    const present = tables.some((t) => t.name === "memory_chunks") && tables.some((t) => t.name === "memory_facts");
    let chunkCount = 0;
    let factCount = 0;
    if (tables.some((t) => t.name === "memory_chunks")) {
      try {
        chunkCount = (db.prepare("SELECT COUNT(*) AS c FROM memory_chunks").get() as { c: number }).c;
      } catch {
        /* table exists but query failed — keep 0 */
      }
    }
    if (tables.some((t) => t.name === "memory_facts")) {
      try {
        factCount = (db.prepare("SELECT COUNT(*) AS c FROM memory_facts").get() as { c: number }).c;
      } catch {
        /* keep 0 */
      }
    }
    return { present, chunkCount, factCount };
  } catch {
    return { present: false, chunkCount: 0, factCount: 0 };
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Compute the current health of the local memory engine. Caches for 3s to
 * avoid hammering the filesystem / agent when the renderer polls.
 */
export async function getLocalMemoryStatus(): Promise<LocalMemoryStatus> {
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.status;
  }

  const dbPath = stateDbPath();
  const conn = getConnectionConfig();
  const remoteMode = conn.mode === "remote" || conn.mode === "ssh" || isRemoteMode();
  const agentRunning = isGatewayRunning();
  const dbExists = existsSync(dbPath);
  const dbSize = dbExists ? safeSize(dbPath) : 0;
  const probe = await probeSchema();

  let health: LocalMemoryHealth = "ok";
  let message = "Local SuperMemory is active.";

  if (remoteMode) {
    // In remote/SSH mode local memory is intentionally off — show a neutral status.
    health = "ok";
    message = "Remote mode — local SuperMemory is disabled.";
  } else if (!agentRunning) {
    // In local mode the agent is what creates/owns state.db. If it's not
    // running and the DB doesn't exist, local memory is dead.
    if (!dbExists) {
      health = "db_missing";
      message = "Local memory is OFF — the agent is not running and no state.db was found.";
    } else if (!probe.present) {
      health = "schema_missing";
      message = "Local agent is offline. Restart it from Settings → Local to re-enable SuperMemory.";
    } else {
      health = "agent_offline";
      message = "Local agent is offline. New conversations won't be persisted until it restarts.";
    }
  } else if (!dbExists) {
    // Agent is "running" but the DB is missing — should never happen
    // (the agent creates the DB on first run) but cover the case.
    health = "db_missing";
    message = "Agent is running but state.db was not found. Send a message to bootstrap it.";
  } else if (!probe.present) {
    health = "schema_missing";
    message = "state.db is missing the SuperMemory tables. Restart the agent to run migrations.";
  }

  const status: LocalMemoryStatus = {
    health,
    dbPath: dbExists ? dbPath : null,
    dbSize,
    agentRunning,
    remoteMode,
    schemaPresent: probe.present,
    message,
    isHealthy: remoteMode || (dbExists && probe.present && agentRunning),
    chunkCount: probe.chunkCount,
    factCount: probe.factCount,
  };

  cached = { status, ts: Date.now() };
  return status;
}

/** Force the next getLocalMemoryStatus() call to recompute. */
export function invalidateLocalMemoryCache(): void {
  cached = null;
}

function safeSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * Best-effort directory creation. Returns true if the parent of state.db
 * exists (or was just created). Used by the renderer-driven "Start local
 * memory" button when the directory is missing entirely.
 */
export async function ensureLocalMemoryDirs(): Promise<boolean> {
  try {
    const dir = profileHome();
    if (!existsSync(dir)) {
      const { mkdirSync } = await import("fs");
      mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch (err) {
    console.error("[LocalMemory] Failed to ensure directories:", err);
    return false;
  }
}

/**
 * Best-effort check whether the Python interpreter that ships with the
 * desktop app exists. If not, the agent cannot be started. Used to give a
 * specific message in the UI instead of a generic failure.
 */
export async function detectAgentPython(): Promise<{ available: boolean; path: string | null }> {
  // The agent lives at ~/.omniworker/omniworker-agent/.venv/bin/python
  const { join } = await import("path");
  const { homedir } = await import("os");
  const venvPython = join(homedir(), ".omniworker", "omniworker-agent", ".venv", "bin", "python");
  return {
    available: existsSync(venvPython),
    path: venvPython,
  };
}

/**
 * Lightweight version check — does not require the agent to be running. We
 * read the package's __version__ via python -c. Safe to fail silently.
 */
export async function detectAgentVersion(): Promise<string | null> {
  const { available, path } = await detectAgentPython();
  if (!available || !path) return null;
  try {
    const { stdout } = await execFileP(path, ["-c", "import omniworker; print(omniworker.__version__)"], {
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
