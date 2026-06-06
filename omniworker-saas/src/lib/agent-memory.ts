// src/lib/agent-memory.ts — Persistent cross-session context store
//
// Bridges the in-memory context-bridge cache with PostgreSQL so that
// session context (decisions, current task, key files) survives:
//   • Server restarts / cold starts
//   • Browser refreshes / new tabs
//   • Model switches between providers
//
// Write path: async after each LLM response — never blocks streaming.
// Read path:  called once per session before the first request to seed
//             the in-memory cache so the model starts warm, not cold.

import { PrismaClient } from "@prisma/client";
import type { ContextHeader } from "./context-bridge";

// ── Types ─────────────────────────────────────────────────────────────────

export interface MemorySaveParams {
  tenantId: string;
  sessionId: string;
  userId: string;
  header: ContextHeader | null;
  messages?: Array<{ role: string; content: string }>;
  messageCount: number;
  lastModel?: string;
}

export interface MemoryRecord {
  sessionSummary: string | null;
  currentTask: string | null;
  recentDecisions: string[];
  keyEntities: string[];
  goals: string[];
  activeFiles: string[];
  pendingErrors: string[];
  lastModel: string | null;
  lastMessages: unknown;
  messageCount: number;
  updatedAt: Date;
}

// ── Read ──────────────────────────────────────────────────────────────────

/**
 * Load persisted memory for a session from PostgreSQL.
 *
 * Returns a reconstructed ContextHeader if memory exists, or null.
 * Call this once per session (on the first request) to seed the
 * in-memory context-bridge cache so the model starts with full context
 * even after a server restart.
 */
export async function loadAgentMemory(
  prisma: PrismaClient,
  tenantId: string,
  sessionId: string,
): Promise<ContextHeader | null> {
  if (!tenantId || !sessionId) return null;

  try {
    const record = await prisma.agentMemory.findUnique({
      where: { tenantId_sessionId: { tenantId, sessionId } },
    });

    if (!record) return null;

    // Reconstruct a ContextHeader from the persisted fields.
    // previousModel + workspaceState are optional in context-bridge.
    return {
      sessionSummary: record.sessionSummary || "",
      currentTask: record.currentTask || "",
      recentDecisions: record.recentDecisions ?? [],
      keyEntities: record.keyEntities ?? [],
      previousModel: record.lastModel || "unknown",
      workspaceState:
        record.activeFiles?.length || record.goals?.length || record.pendingErrors?.length
          ? {
              files: record.activeFiles ?? [],
              goals: record.goals ?? [],
              errors: record.pendingErrors ?? [],
              decisions: record.recentDecisions ?? [],
            }
          : undefined,
      generatedAt: record.updatedAt.getTime(),
      messageCountAtGen: record.messageCount,
    };
  } catch (err) {
    // Non-fatal: if the table doesn't exist yet (pre-migration), degrade silently.
    console.warn("[AgentMemory] load failed (non-fatal):", (err as Error).message);
    return null;
  }
}

// ── Write ─────────────────────────────────────────────────────────────────

/**
 * Persist the current context header to PostgreSQL.
 *
 * Always call this with `void` (fire-and-forget) after sending the LLM
 * response — never await it in the hot path so it never adds latency.
 *
 *   void saveAgentMemory(prisma, { … });
 */
export async function saveAgentMemory(
  prisma: PrismaClient,
  params: MemorySaveParams,
): Promise<void> {
  const { tenantId, sessionId, userId, header, messages, messageCount, lastModel } = params;

  if (!tenantId || !sessionId || !header) return;

  // Keep only last 5 messages for the lightweight "quick resume" store.
  const lastMessages = messages ? messages.slice(-5) : null;

  const data = {
    sessionSummary: header.sessionSummary || null,
    currentTask: header.currentTask || null,
    recentDecisions: header.recentDecisions?.slice(0, 10) ?? [],
    keyEntities: header.keyEntities?.slice(0, 12) ?? [],
    goals: header.workspaceState?.goals?.slice(0, 10) ?? [],
    activeFiles: header.workspaceState?.files?.slice(0, 12) ?? [],
    pendingErrors: header.workspaceState?.errors?.slice(0, 5) ?? [],
    lastModel: lastModel || header.previousModel || null,
    lastMessages: lastMessages as any,
    messageCount,
  };

  try {
    await prisma.agentMemory.upsert({
      where: { tenantId_sessionId: { tenantId, sessionId } },
      create: { tenantId, sessionId, userId, ...data },
      update: data,
    });
  } catch (err) {
    // Non-fatal: pre-migration or DB hiccup.
    console.warn("[AgentMemory] save failed (non-fatal):", (err as Error).message);
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────

/**
 * Delete memory records older than `maxAgeDays` to prevent unbounded growth.
 * Call from a cron job (e.g., weekly).
 */
export async function pruneOldMemories(
  prisma: PrismaClient,
  maxAgeDays = 30,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  try {
    const { count } = await prisma.agentMemory.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    return count;
  } catch {
    return 0;
  }
}
