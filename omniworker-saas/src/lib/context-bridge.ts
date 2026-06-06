// src/lib/context-bridge.ts — Cross-model context persistence layer
//
// Problem: When the SaaS routes requests to different LLM providers
// (GLM-5.1, DeepSeek Flash, Kimi K2.5 etc.), each model has zero knowledge
// of what previous models responded. This causes context loss, repeated
// questions, and contradicted decisions.
//
// Solution: Generate a compact "Context Header" (~800-1200 tokens) that
// summarizes the session state and inject it into every request before
// the provider cascade. The header is cached per-user with a 15-minute TTL
// and only regenerated when the conversation grows significantly.

import { fetchWithBackoff } from "./fetch-backoff";

// ── Optional: fetch structured workspace state from a local agent ──

const AGENT_BASE_URL = process.env.FLUX_AGENT_API_URL || "http://127.0.0.1:8642";
const AGENT_API_KEY = process.env.FLUX_AGENT_API_KEY || "";

async function fetchWorkspaceState(sessionId: string): Promise<WorkspaceState | undefined> {
  if (!sessionId || sessionId.length < 8) return undefined;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (AGENT_API_KEY) headers["Authorization"] = `Bearer ${AGENT_API_KEY}`;
    const res = await fetchWithBackoff(
      `${AGENT_BASE_URL}/v1/sessions/${encodeURIComponent(sessionId)}/workspace`,
      { method: "GET", headers },
      1,
      2000
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { workspace?: Record<string, unknown> };
    const ws = data.workspace;
    if (!ws) return undefined;
    return {
      files: Array.isArray(ws.files) ? ws.files.map(String) : undefined,
      errors: Array.isArray(ws.errors) ? ws.errors.map(String) : undefined,
      decisions: Array.isArray(ws.decisions) ? ws.decisions.map(String) : undefined,
      goals: Array.isArray(ws.goals) ? ws.goals.map(String) : undefined,
      lastTask: ws.last_task ? String(ws.last_task) : undefined,
    };
  } catch {
    return undefined;
  }
}

// ── Types ────────────────────────────────────────────────────────────────

export interface WorkspaceState {
  files?: string[];            // Recently edited files
  errors?: string[];           // Pending errors / blockers
  decisions?: string[];        // Recent architectural decisions
  goals?: string[];            // Active goals / tasks
  lastTask?: string;           // Last task summary
}

export interface ContextHeader {
  sessionSummary: string;      // What the session is about (1-2 sentences)
  recentDecisions: string[];   // Last 3-5 technical/design decisions made
  currentTask: string;         // What's being worked on right now
  previousModel: string;       // Which model responded last (for continuity)
  keyEntities: string[];       // Files, modules, concepts being discussed
  workspaceState?: WorkspaceState; // Structured workspace state from agent DB
  generatedAt: number;         // Unix timestamp of generation
  messageCountAtGen: number;   // Message count when header was generated
}

interface CacheEntry {
  header: ContextHeader;
  expiresAt: number;
}

interface ProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
  endpoint?: "chat_completions" | "messages";
}

interface Message {
  role: string;
  content: string;
}

// ── Configuration ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_MESSAGES_FOR_HEADER = 6;    // Don't generate for short conversations
const REGEN_DELTA = 5;                // Regenerate when conversation grows by 5+ messages
const MAX_HEADER_TOKENS = 2048;       // Hard cap on header size (chars / 4)
const MAX_HEADER_CHARS = MAX_HEADER_TOKENS * 4;

// ── In-memory cache (per-user, per-session) ──────────────────────────────
// Exported so the chat route can pre-warm it from PostgreSQL on cold starts.
export const headerCache = new Map<string, CacheEntry>();

export function getCacheKey(userId: string, messages: Message[]): string {
  // Key by user + first message hash (session identity)
  const firstMsg = messages[0]?.content?.slice(0, 200) || "";
  let h = 5381;
  for (let i = 0; i < firstMsg.length; i++) {
    h = ((h << 5) + h) + firstMsg.charCodeAt(i);
  }
  return `${userId}:${h >>> 0}`;
}

function evictExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of headerCache.entries()) {
    if (entry.expiresAt < now) headerCache.delete(key);
  }
}

// ── Provider URL mapping (mirrors route.ts) ──────────────────────────────

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/chat/completions",
  moonshot: "https://api.kimi.com/coding/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
  "z-ai": "https://api.z.ai/api/coding/paas/v4/chat/completions",
  "kimi-code": "https://api.kimi.com/coding/v1/chat/completions",
  stepfun: "https://api.stepfun.ai/step_plan/v1/chat/completions",
};

const OPENCODE_GO_ENDPOINTS = {
  chat_completions: "https://opencode.ai/zen/go/v1/chat/completions",
  messages: "https://opencode.ai/zen/go/v1/messages",
} as const;

// ── Header Generation ────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a context extraction engine. Analyze the conversation and output a JSON object with exactly these fields:

{
  "sessionSummary": "A detailed summary (1-2 paragraphs) of what this session is about, detailing the architecture, features being built, and current progress",
  "recentDecisions": ["list of the last 5-10 key technical or design decisions made"],
  "currentTask": "what is currently being worked on or discussed in detail",
  "keyEntities": ["files", "modules", "concepts", "functions", "technologies mentioned"]
}

Rules:
- Be precise, detailed and clear. Don't omit critical architecture details.
- recentDecisions: Only include actual decisions, not questions or discussion.
- keyEntities: Max 12 items. Only include specific names (files, functions, libraries).
- Output ONLY valid JSON, no markdown, no explanation.`;

async function generateContextHeader(
  messages: Message[],
  config: ProviderConfig
): Promise<ContextHeader | null> {
  // Take last 20 non-system messages for extraction (enough context, bounded cost)
  const relevantMsgs = messages
    .filter(m => m.role !== "system")
    .slice(-20);

  if (relevantMsgs.length < 3) return null;

  const conversationText = relevantMsgs
    .map(m => `[${m.role}]: ${(m.content || "").slice(0, 500)}`)
    .join("\n\n");

  // Truncate if conversation text is too long (save tokens on the extraction call)
  const truncatedConvo = conversationText.length > 6000
    ? conversationText.slice(0, 6000) + "\n\n[... earlier messages truncated ...]"
    : conversationText;

  const extractionMessages: Message[] = [
    { role: "user", content: `${EXTRACTION_PROMPT}\n\nConversation:\n${truncatedConvo}` }
  ];

  let url = PROVIDER_URLS[config.provider] || PROVIDER_URLS.openai;
  if (config.provider === "opencode-go" && config.endpoint) {
    url = OPENCODE_GO_ENDPOINTS[config.endpoint];
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let payload: Record<string, unknown>;

  const useAnthropicFormat =
    config.provider === "anthropic" ||
    (config.provider === "opencode-go" && config.endpoint === "messages");

  if (useAnthropicFormat) {
    if (config.provider === "anthropic") {
      headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
      headers["x-api-key"] = config.apiKey;
    }
    payload = {
      model: config.model,
      max_tokens: 512,
      messages: extractionMessages,
    };
  } else {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
    payload = {
      model: config.model,
      max_tokens: 512,
      messages: extractionMessages,
      temperature: 0.1, // Low temperature for consistent extraction
    };
  }

  try {
    const res = await fetchWithBackoff(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[ContextBridge] Extraction failed:", (await res.text()).slice(0, 300));
      return null;
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Extract content from various response formats
    let content =
      (data.choices as any)?.[0]?.message?.content ||
      (data.content as any)?.[0]?.text ||
      null;

    if (!content) return null;

    // Clean markdown fences if present
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    const parsed = JSON.parse(content);
    return {
      sessionSummary: String(parsed.sessionSummary || "").slice(0, 1000),
      recentDecisions: (parsed.recentDecisions || []).slice(0, 10).map((d: any) => String(d).slice(0, 300)),
      currentTask: String(parsed.currentTask || "").slice(0, 500),
      previousModel: config.model,
      keyEntities: (parsed.keyEntities || []).slice(0, 12).map((e: any) => String(e).slice(0, 100)),
      generatedAt: Date.now(),
      messageCountAtGen: messages.length,
    };
  } catch (err) {
    console.error("[ContextBridge] Generation error:", err);
    return null;
  }
}

// ── Fallback: Heuristic extraction (zero LLM cost) ──────────────────────

function generateFallbackHeader(messages: Message[]): ContextHeader {
  const nonSystem = messages.filter(m => m.role !== "system");
  const recent = nonSystem.slice(-10);

  // Extract key entities via simple pattern matching
  const allContent = recent.map(m => m.content || "").join(" ");
  const entities = new Set<string>();

  // File paths
  const filePaths = allContent.match(/[\w/-]+\.(ts|tsx|js|jsx|py|css|md|json|yaml|yml|prisma)/gi);
  if (filePaths) filePaths.slice(0, 5).forEach(f => entities.add(f));

  // Code identifiers (PascalCase or camelCase words > 5 chars)
  const identifiers = allContent.match(/\b[A-Z][a-zA-Z]{5,}\b/g);
  if (identifiers) [...new Set(identifiers)].slice(0, 3).forEach(id => entities.add(id));

  // Get last assistant response as current task hint
  const lastAssistant = [...recent].reverse().find(m => m.role === "assistant");
  const taskHint = lastAssistant?.content?.slice(0, 200) || "";

  // Extract decisions: look for patterns like "decided to", "using", "will use"
  const decisions: string[] = [];
  for (const msg of recent) {
    const content = msg.content || "";
    const decisionPatterns = [
      /(?:decided?|decidimos|usando|elegimos|vamos con|usaremos|implementamos)\s+(.{10,80})/gi,
      /(?:will use|let's go with|going with|chosen|selected)\s+(.{10,80})/gi,
    ];
    for (const pattern of decisionPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) decisions.push(match[1].trim());
      }
    }
  }

  // Extract errors from tool results and assistant messages
  const errors: string[] = [];
  for (const msg of recent) {
    const content = msg.content || "";
    const errorPatterns = [
      /(?:error|exception|failed|failure|traceback)\s*[:\-]?\s*(.{10,120})/gi,
      /(?:syntaxerror|typeerror|referenceerror|importerror)\s*[:\-]?\s*(.{10,120})/gi,
    ];
    for (const pattern of errorPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) errors.push(match[1].trim());
      }
    }
  }

  // Extract goals / tasks from assistant messages
  const goals: string[] = [];
  for (const msg of recent) {
    if (msg.role !== "assistant") continue;
    const content = msg.content || "";
    const goalPatterns = [
      /(?:goal|task|objective|todo|next step|plan)\s*[:\-]?\s*(.{10,120})/gi,
      /(?:necesitamos|vamos a|let's|we need to|next we should)\s+(.{10,120})/gi,
    ];
    for (const pattern of goalPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) goals.push(match[1].trim());
      }
    }
  }

  // Extract tool_calls from assistant messages (if present in raw messages)
  const toolNames = new Set<string>();
  for (const msg of recent) {
    if (msg.role === "assistant" && (msg as any).tool_calls) {
      const tcs = (msg as any).tool_calls;
      if (Array.isArray(tcs)) {
        tcs.forEach((tc: any) => {
          const name = tc.function?.name || tc.name;
          if (name) toolNames.add(name);
        });
      }
    }
  }

  // First user message as session summary
  const firstUser = nonSystem.find(m => m.role === "user");
  const summary = firstUser?.content?.slice(0, 200) || "General conversation";

  return {
    sessionSummary: summary,
    recentDecisions: [...new Set(decisions)].slice(0, 3),
    currentTask: taskHint.slice(0, 150),
    previousModel: "unknown",
    keyEntities: [...entities].slice(0, 8),
    workspaceState: {
      files: [...entities].slice(0, 5),
      errors: [...new Set(errors)].slice(0, 3),
      goals: [...new Set(goals)].slice(0, 3),
      decisions: [...new Set(decisions)].slice(0, 3),
    },
    generatedAt: Date.now(),
    messageCountAtGen: messages.length,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Get or build a context header for the current conversation.
 *
 * Returns cached header if fresh enough, generates a new one if needed.
 * Falls back to heuristic extraction if the LLM call fails.
 *
 * @returns ContextHeader or null if conversation is too short
 */
export async function getOrBuildContextHeader(
  userId: string,
  messages: Message[],
  config: ProviderConfig,
  sessionId?: string,
  prisma?: any,
  tenantId?: string,
): Promise<ContextHeader | null> {
  if (!messages || messages.length < MIN_MESSAGES_FOR_HEADER) return null;

  evictExpiredEntries();

  const key = getCacheKey(userId, messages);
  const cached = headerCache.get(key);

  const triggerBackgroundRegen = (currentHeader: ContextHeader) => {
    console.log(`[ContextBridge] Triggering background LLM extraction for user ${userId.slice(0, 8)}...`);
    void (async () => {
      try {
        const newHeader = await generateContextHeader(messages, config);
        if (newHeader) {
          if (sessionId) {
            const ws = await fetchWorkspaceState(sessionId);
            if (ws) {
              enrichHeaderWithWorkspace(newHeader, ws);
            }
          }
          // Update in-memory cache
          headerCache.set(key, {
            header: newHeader,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });

          // Save to PostgreSQL if prisma client is provided
          if (prisma && tenantId && sessionId) {
            const { saveAgentMemory } = await import("./agent-memory");
            await saveAgentMemory(prisma, {
              tenantId,
              sessionId,
              userId,
              header: newHeader,
              messages,
              messageCount: messages.length,
              lastModel: config.model,
            });
          }
          console.log(`[ContextBridge] Background LLM extraction completed & cached for user ${userId.slice(0, 8)}`);
        }
      } catch (err) {
        console.error("[ContextBridge] Background regeneration failed:", err);
      }
    })();
  };

  // Cache hit: return immediate cached header, and trigger background update if delta is large enough
  if (cached && cached.expiresAt > Date.now()) {
    const delta = messages.length - cached.header.messageCountAtGen;
    if (delta >= REGEN_DELTA) {
      triggerBackgroundRegen(cached.header);
    }
    return cached.header;
  }

  // Cache miss (cold start / session start):
  // Generate fallback header instantly (0 latency, 0 tokens) and trigger background LLM extraction
  console.log(`[ContextBridge] Cache miss. Generating fast fallback header & triggering background LLM extraction...`);
  const fallbackHeader = generateFallbackHeader(messages);
  if (sessionId) {
    const ws = await fetchWorkspaceState(sessionId);
    if (ws) {
      enrichHeaderWithWorkspace(fallbackHeader, ws);
    }
  }

  // Set the fallback in cache immediately so subsequent request/retry hits cache
  headerCache.set(key, {
    header: fallbackHeader,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  // Trigger background LLM extraction
  triggerBackgroundRegen(fallbackHeader);

  return fallbackHeader;
}

function enrichHeaderWithWorkspace(header: ContextHeader, ws: WorkspaceState): void {
  header.workspaceState = ws;
  if (header.recentDecisions.length === 0 && ws.decisions) {
    header.recentDecisions = ws.decisions.slice(0, 5);
  }
  if (!header.currentTask && ws.lastTask) {
    header.currentTask = ws.lastTask;
  }
  if (ws.files) {
    const existing = new Set(header.keyEntities);
    ws.files.forEach(f => existing.add(f));
    header.keyEntities = [...existing].slice(0, 8);
  }
}

/**
 * Format a context header as a system message for injection.
 */
export function formatContextHeaderAsMessage(header: ContextHeader): Message {
  const parts: string[] = [
    "## Session Context (auto-generated for model continuity)",
    "",
    `**Current session**: ${header.sessionSummary}`,
    `**Current task**: ${header.currentTask || "Continuing conversation"}`,
  ];

  if (header.workspaceState) {
    const ws = header.workspaceState;
    if (ws.files && ws.files.length > 0) {
      parts.push(`**Active files**: ${ws.files.join(", ")}`);
    }
    if (ws.errors && ws.errors.length > 0) {
      parts.push(`**Pending errors**: ${ws.errors.join(", ")}`);
    }
    if (ws.goals && ws.goals.length > 0) {
      parts.push(`**Active goals**: ${ws.goals.join(", ")}`);
    }
    if (ws.decisions && ws.decisions.length > 0) {
      parts.push("**Recent decisions**:");
      ws.decisions.forEach(d => parts.push(`- ${d}`));
    }
  }

  if (header.recentDecisions.length > 0 && !header.workspaceState?.decisions) {
    parts.push("**Key decisions made**:");
    header.recentDecisions.forEach(d => parts.push(`- ${d}`));
  }

  if (header.keyEntities.length > 0) {
    parts.push(`**Key context**: ${header.keyEntities.join(", ")}`);
  }

  if (header.previousModel) {
    parts.push(`**Previous model**: ${header.previousModel}`);
  }

  parts.push("");
  parts.push("Use this context to maintain continuity. Do not reference this header in your response.");

  const content = parts.join("\n");

  // Hard cap to prevent runaway headers
  return {
    role: "system",
    content: content.slice(0, MAX_HEADER_CHARS),
  };
}

/**
 * Inject a context header into a message array.
 *
 * Strategy: Insert as a system message right after existing system messages
 * but before the conversation history. This keeps it visible to the model
 * without disrupting the user/assistant alternation pattern.
 */
export function injectContextHeader(
  messages: Message[],
  header: ContextHeader
): Message[] {
  const headerMsg = formatContextHeaderAsMessage(header);
  const result = [...messages];

  // Find the last system message index
  let lastSystemIdx = -1;
  for (let i = 0; i < result.length; i++) {
    if (result[i].role === "system") lastSystemIdx = i;
    else break; // System messages are always at the top
  }

  // Insert after last system message (or at position 0 if none)
  result.splice(lastSystemIdx + 1, 0, headerMsg);

  return result;
}
