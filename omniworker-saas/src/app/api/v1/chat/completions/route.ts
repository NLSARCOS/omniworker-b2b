import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatCompletionSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchWithBackoff } from "@/lib/fetch-backoff";
import { compactMessages } from "@/lib/conversation-compaction";
import { getHealthyModels } from "@/lib/provider-health";

// Provider → URL mapping
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

// Default model for each provider
const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-haiku-20240307",
  deepseek: "deepseek-chat",
  groq: "llama-3.1-8b-instant",
  gemini: "gemini-2.0-flash",
  mistral: "mistral-small-latest",
  cohere: "command-r",
  together: "meta-llama/Llama-3-8b-chat-hf",
  nvidia: "stepfun-ai/step-3.7-flash",
  "opencode-go": "glm-5",
  ollama: "llama3",
  moonshot: "k2.6",
  "z-ai": "glm-5.1",
  "kimi-code": "k2.6",
};

// NVIDIA GLM-specific config: enable thinking but hide reasoning output
// This makes GLM "think" internally for better answers without sending
// verbose reasoning text back (saves tokens and response time).
function applyNvidiaGLMConfig(payload: Record<string, unknown>, model: string, provider: string): Record<string, unknown> {
  if (provider !== "nvidia") return payload;
  const m = (model || "").toLowerCase();
  if (m.includes("glm")) {
    return {
      ...payload,
      max_tokens: Math.min((payload.max_tokens as number) || 4096, 4096),
      chat_template_kwargs: { enable_thinking: true, clear_thinking: true },
    };
  }
  return payload;
}

// OpenCode Go has two endpoint formats depending on the model
const OPENCODE_GO_ENDPOINTS = {
  chat_completions: "https://opencode.ai/zen/go/v1/chat/completions",
  messages: "https://opencode.ai/zen/go/v1/messages",
} as const;

type OpenCodeEndpoint = keyof typeof OPENCODE_GO_ENDPOINTS;

/**
 * Detects whether the conversation is in the middle of a tool exchange:
 * the last meaningful (non-system) message is either a tool result awaiting
 * the model's continuation, or an assistant turn that requested tools.
 * Switching to a DIFFERENT model at this point would hand a half-finished
 * tool sequence to a model that didn't start it — the classic "agent goes
 * dumb mid-task" failure. The router uses this to lock onto the pinned model.
 */
function isMidToolSequence(messages: any[]): boolean {
  if (!Array.isArray(messages)) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role === "system") continue;
    if (m.role === "tool") return true;
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return true;
    return false; // last meaningful turn is a normal user/assistant message
  }
  return false;
}

function isSimpleGreeting(messages: any[]): boolean {
  const last = messages.filter((m: any) => m.role === "user").pop();
  if (!last) return false;
  const raw = String(last.content || "").trim().toLowerCase();
  if (!raw || raw.length > 80) return false;
  // Normalize: strip accents and inner punctuation so "Hola, cómo estás?"
  // matches the same patterns as "hola como estas". A single comma used to
  // defeat detection and cost the user the full 10K-token agent prompt.
  const text = raw
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[.,!?¡¿;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return false;

  // Single-word greetings
  if (/^(hola|hello|hi|hey|buenos|buenas|saludos|yo|sup|aloha)$/i.test(text)) return true;

  // Multi-word greeting phrases
  const greetingPhrases = [
    /^(hola|hello|hi|hey)\s+(como|c[oó]mo)\s+(estas|est[aá]s|te va|va todo|van las cosas)/i,
    /^(qu[eé]\s*tal|what'?s\s+up|how\s+(are\s+)?you|how'?s\s+it\s+going)/i,
    /^(buenos?\s+(d[ií]as|d[ií]a|tardes|noches)|good\s+(morning|afternoon|evening|night))/i,
    /^(todo\s+bien|todo\s+ok|all\s+good|all\s+fine|i'?m\s+fine)/i,
    /^(c[oó]mo\s+te\s+va|c[oó]mo\s+est[aá]s|how\s+are\s+things)/i,
    /^(nice\s+to\s+meet|encantado|mucho\s+gusto)/i,
    /^(gracias|thanks|thank\s+you|ty)[\s!.,]*$/i,
  ];

  return greetingPhrases.some(p => p.test(text));
}

function trimSystemPrompt(systemContent: string): string {
  // For simple greetings, keep the first 500 chars of the system prompt
  // (identity + core instructions) instead of replacing everything with a
  // generic "helpful assistant" message that destroys all session context.
  const trimmed = systemContent.slice(0, 500).trim();
  if (!trimmed) return "You are a helpful assistant. Reply in 1-2 short sentences.";
  return trimmed + "\n\nReply in 1-2 short sentences for this greeting.";
}

// Flux Agent virtual models → role-based system prompts
const FLUX_AGENT_ROLES: Record<string, string> = {
  "omniworker-code": `You are Flux Agent Code, an expert software engineer and coding assistant.
You write clean, efficient, well-documented code.
Always prefer production-quality solutions with proper error handling.
When fixing bugs, explain the root cause. When suggesting code, include complete examples.
Languages, frameworks, and tools: you are fluent in all of them.`,
};

// ── SSE Sanitization: hide real model/provider from client ─────────────
function sanitizeSSEChunk(chunk: Uint8Array, realModel: string, requestedModel: string): Uint8Array {
  if (!realModel || realModel === requestedModel) return chunk;
  const text = new TextDecoder().decode(chunk);
  const sanitized = text.replaceAll(`"${realModel}"`, `"${requestedModel}"`);
  return sanitized === text ? chunk : new TextEncoder().encode(sanitized);
}

// ── SSE Token Counter and Billing Reconciliation Helpers ─────────────────
class SSETokenCounter {
  private decoder = new TextDecoder();
  private buffer = "";
  private generatedText = "";
  private actualPromptTokens = 0;
  private actualCompletionTokens = 0;
  private actualTotalTokens = 0;
  private hasUsage = false;

  constructor(private promptEst: number) {
    this.actualPromptTokens = promptEst;
  }

  feed(chunk: Uint8Array) {
    const text = this.decoder.decode(chunk, { stream: true });
    this.buffer += text;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === "[DONE]") continue;

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.usage) {
          this.actualPromptTokens = parsed.usage.prompt_tokens || this.actualPromptTokens;
          this.actualCompletionTokens = parsed.usage.completion_tokens || this.actualCompletionTokens;
          this.actualTotalTokens = parsed.usage.total_tokens || this.actualTotalTokens;
          this.hasUsage = true;
        }

        if (parsed.choices?.[0]?.delta?.content) {
          this.generatedText += parsed.choices[0].delta.content;
        } else if (parsed.delta?.text) {
          this.generatedText += parsed.delta.text;
        } else if (parsed.content) {
          this.generatedText += parsed.content;
        }
      } catch {
        // Ignore JSON parse errors for non-JSON lines
      }
    }
  }

  getResults() {
    if (this.hasUsage && this.actualTotalTokens > 0) {
      return {
        promptTokens: this.actualPromptTokens,
        completionTokens: this.actualCompletionTokens,
        totalTokens: this.actualTotalTokens,
      };
    }

    const completionTokens = Math.max(1, Math.floor(this.generatedText.length / 4));
    return {
      promptTokens: this.actualPromptTokens,
      completionTokens: completionTokens,
      totalTokens: this.actualPromptTokens + completionTokens,
    };
  }
}

async function reconcileStreamBilling(
  userId: string,
  licenseId: string | null,
  tenantId: string | null,
  requestedModel: string,
  promptTokensEst: number,
  estimatedCost: number,
  counter: SSETokenCounter
) {
  const actual = counter.getResults();
  const actualCost = actual.totalTokens;

  console.log(`[Reconciliation] Est Cost: ${estimatedCost}, Actual Cost: ${actualCost}, Prompt: ${actual.promptTokens}, Completion: ${actual.completionTokens}`);

  // Refund if we overcharged during pre-deduction
  let refundAmount = 0;
  if (estimatedCost > actualCost) {
    const diff = estimatedCost - actualCost;
    if (diff > Math.max(5, actualCost * 0.05)) {
      refundAmount = diff;
    }
  }

  // Charge more if actual cost exceeded pre-deduction
  let extraCharge = 0;
  if (actualCost > estimatedCost) {
    extraCharge = actualCost - estimatedCost;
  }

  if (refundAmount > 0) {
    console.log(`[Reconciliation] Refunding ${refundAmount} tokens to user/license`);
    try {
      if (licenseId) {
        await prisma.license.update({
          where: { id: licenseId },
          data: { tokenBalance: { increment: refundAmount } },
        });
      } else {
        await prisma.user.update({
          where: { id: userId },
          data: { tokenBalance: { increment: refundAmount } },
        });
      }
    } catch (e) {
      console.error("[Reconciliation Refund Error]", e);
    }
  }

  if (extraCharge > 0) {
    console.log(`[Reconciliation] Extra charging ${extraCharge} tokens (actual exceeded pre-deduction)`);
    try {
      if (licenseId) {
        await prisma.license.update({
          where: { id: licenseId },
          data: { tokenBalance: { decrement: extraCharge } },
        });
      } else {
        await prisma.user.update({
          where: { id: userId },
          data: { tokenBalance: { decrement: extraCharge } },
        });
      }
    } catch (e) {
      console.error("[Reconciliation Extra Charge Error]", e);
    }
  }

  try {
    await prisma.taskLog.create({
      data: {
        userId,
        tenantId,
        promptTokens: actual.promptTokens,
        completionTks: actual.completionTokens,
        modelUsed: requestedModel,
        taskType: requestedModel === "omniworker-code" ? "code_generation" : "cloud_reasoning",
        status: "completed",
      },
    });
  } catch (e) {
    console.error("[Reconciliation TaskLog Error]", e);
  }
}

function estimatePromptTokens(messages: any[]): number {
  if (!messages || messages.length === 0) return 0;

  let totalChars = 0;
  let nonAsciiCount = 0;

  for (const msg of messages) {
    const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
    totalChars += text.length;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 127) nonAsciiCount++;
    }
    // Per-message overhead (~2 tokens for role separators)
    totalChars += 8;
  }

  if (totalChars === 0) return 0;

  const isNonAsciiHeavy = (nonAsciiCount / totalChars) > 0.3;
  const multiplier = isNonAsciiHeavy ? 1.5 : 1.0;

  return Math.max(5, Math.floor((totalChars / 4) * multiplier));
}

// ── OpenCode Go Intelligent Routing ──────────────────────────────────
interface ModelTier {
  id: string;
  label: string;
  tier: "reasoning" | "balanced" | "speed";
  weight: number; // higher = more likely to be picked within tier
  endpoint: OpenCodeEndpoint; // which OpenCode Go endpoint format this model uses
}

const OPENCODE_GO_CATALOG: ModelTier[] = [
  // Tier: REASONING — heavy tasks, complex code, long context
  { id: "glm-5.1",         label: "GLM-5.1",         tier: "reasoning", weight: 3, endpoint: "chat_completions" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro",  tier: "reasoning", weight: 0, endpoint: "chat_completions" },
  { id: "kimi-k2.6",       label: "Kimi K2.6",        tier: "reasoning", weight: 2, endpoint: "chat_completions" },
  { id: "mimo-v2.5-pro",   label: "MiMo-V2.5-Pro",    tier: "reasoning", weight: 2, endpoint: "chat_completions" },
  { id: "qwen3.7-max",     label: "Qwen3.7 Max",      tier: "reasoning", weight: 2, endpoint: "messages" },
  { id: "qwen3.6-plus",    label: "Qwen3.6 Plus",     tier: "reasoning", weight: 2, endpoint: "messages" },
  { id: "minimax-m2.7",    label: "MiniMax M2.7",     tier: "reasoning", weight: 1, endpoint: "messages" },
  // Tier: BALANCED — general purpose, mid-complexity
  { id: "glm-5",           label: "GLM-5",            tier: "balanced",  weight: 3, endpoint: "chat_completions" },
  { id: "kimi-k2.5",       label: "Kimi K2.5",        tier: "balanced",  weight: 3, endpoint: "chat_completions" },
  { id: "mimo-v2.5",       label: "MiMo-V2.5",        tier: "balanced",  weight: 2, endpoint: "chat_completions" },
  { id: "minimax-m2.5",    label: "MiniMax M2.5",     tier: "balanced",  weight: 1, endpoint: "messages" },
  // Tier: SPEED — fast responses, simple queries, chat
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "speed", weight: 4, endpoint: "chat_completions" },
  { id: "glm-5",             label: "GLM-5",             tier: "speed", weight: 2, endpoint: "chat_completions" },
  { id: "kimi-k2.5",         label: "Kimi K2.5",          tier: "speed", weight: 2, endpoint: "chat_completions" },
];

const OPENCODE_GO_MODEL_IDS = [...new Set(OPENCODE_GO_CATALOG.map(m => m.id))];

/**
 * Analyzes the prompt complexity and returns the best tier.
 * Scoring:
 *  - Long prompts (>2000 chars) → reasoning
 *  - Code-related keywords → reasoning
 *  - Medium prompts (500-2000) → balanced
 *  - Short/simple prompts → speed
 */
function classifyPromptComplexity(messages: { role: string; content: string }[]): "reasoning" | "balanced" | "speed" {
  // Only analyze user/assistant messages — system prompts from agents are always
  // huge (20K+ chars with skills, tools, AGENTS.md) and would always bias to
  // "reasoning" tier even for simple messages like "hola".
  const userMessages = messages.filter(m => m.role !== "system");
  const fullText = userMessages.map(m => m.content || "").join(" ");
  const totalLength = fullText.length;
  const messageCount = userMessages.length;

  // Complexity signals
  let score = 0;

  // Length-based scoring (user content only)
  if (totalLength > 4000) score += 3;
  else if (totalLength > 2000) score += 2;
  else if (totalLength > 800) score += 1;

  // Code/technical complexity indicators
  const codePatterns = /```|function\s|class\s|import\s|export\s|const\s|def\s|async\s|await\s|\{[\s\S]*\}|SELECT\s|CREATE\s|ALTER\s|interface\s|type\s.*=/gi;
  const codeMatches = fullText.match(codePatterns);
  if (codeMatches && codeMatches.length > 3) score += 3;
  else if (codeMatches && codeMatches.length > 0) score += 1;

  // Reasoning keywords
  const reasoningPatterns = /analyz|architect|refactor|optimi[zs]|debug|explain.*why|design.*system|implement.*complex|review.*code|compare|trade.?off|security|migration/gi;
  const reasoningMatches = fullText.match(reasoningPatterns);
  if (reasoningMatches && reasoningMatches.length >= 2) score += 2;
  else if (reasoningMatches) score += 1;

  // Conversation depth
  if (messageCount > 10) score += 2;
  else if (messageCount > 5) score += 1;

  // Continuation messages ("continúa", "sigue", "dale") carry no signal of
  // their own but inherit the complexity of the ongoing task. Without this,
  // a short "continúa" mid-task downgrades to the speed tier and the model
  // quality drops abruptly.
  const lastUser = [...userMessages].reverse().find(m => m.role === "user");
  const lastText = String(lastUser?.content || "").trim().toLowerCase();
  const isContinuation =
    lastText.length < 50 &&
    /^(contin[uú]a|sigue|seguim?os|dale|avanza|adelante|continue|go\s+on|keep\s+going|next|proceed|resume|y\s+ahora|ahora\s+s[ií]|hazlo|do\s+it)\b/.test(lastText);
  if (isContinuation && messageCount > 3) score = Math.max(score, 2);

  // Map score to tier
  if (score >= 5) return "reasoning";
  if (score >= 2) return "balanced";
  return "speed";
}

// ── Deterministic seeding (model stickiness within a conversation) ──────
// A free Math.random() re-rolled the model on every turn, so a single task
// bounced between GLM-5.1 → Kimi → MiMo → Qwen and the agent "lost its mind"
// mid-task. Seeding the selection with a stable conversation key keeps the
// SAME model for the SAME conversation/tier across turns.
function hashStringToSeed(s: string): number {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle driven by a seeded PRNG. Using a stable
 * conversation seed instead of Math.random() keeps the candidate ordering
 * identical across turns of the SAME conversation, so a conversation lands on
 * the same provider every turn (prompt-cache affinity) while still spreading
 * load across DIFFERENT conversations.
 */
function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Stable per-conversation seed. Prefers an explicit conversationId; otherwise
 * derives one from userId + the first user message (stable across turns).
 */
function conversationSeed(
  messages: { role: string; content?: unknown }[],
  userId: string,
  conversationId?: string
): number {
  if (conversationId) return hashStringToSeed(`conv:${conversationId}`);
  const firstUser = messages.find(m => m.role === "user");
  const anchor = typeof firstUser?.content === "string"
    ? firstUser.content
    : JSON.stringify(firstUser?.content || "");
  return hashStringToSeed(`${userId}|${anchor.slice(0, 200)}`);
}

/**
 * Weighted selection within a tier.
 * Models with higher weight are picked proportionally more often.
 * `rng` defaults to Math.random; pass a seeded PRNG for deterministic
 * (sticky) selection within a conversation.
 */
function selectModelFromTier(
  tier: "reasoning" | "balanced" | "speed",
  rng: () => number = Math.random
): ModelTier {
  const candidates = OPENCODE_GO_CATALOG.filter(m => m.tier === tier);
  const totalWeight = candidates.reduce((sum, m) => sum + m.weight, 0);
  let random = rng() * totalWeight;

  for (const model of candidates) {
    random -= model.weight;
    if (random <= 0) return model;
  }

  return candidates[0]; // fallback
}

/**
 * Intelligent OpenCode Go model selection.
 * Returns { model, tier, endpoint } for routing and observability.
 * When `seed` is provided, selection is deterministic for that conversation.
 */
function intelligentModelSelect(
  messages: { role: string; content: string }[],
  seed?: number
): { model: string; tier: string; endpoint: OpenCodeEndpoint } {
  const tier = classifyPromptComplexity(messages);
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;
  const selected = selectModelFromTier(tier, rng);
  return { model: selected.id, tier, endpoint: selected.endpoint };
}

// ── Model pin (conversation stickiness, persistent) ────────────────────
// Stored in ConversationModel. All ops are wrapped in try/catch so that if the
// migration hasn't been applied yet the router silently degrades to seeded
// selection instead of failing the request.
interface ModelPin { provider: string; model: string; endpoint: OpenCodeEndpoint }

async function loadModelPin(conversationKey: string): Promise<ModelPin | null> {
  try {
    const pin = await prisma.conversationModel.findUnique({
      where: { conversationId: conversationKey },
    });
    if (pin) {
      return {
        provider: pin.provider,
        model: pin.model,
        endpoint: (pin.endpoint as OpenCodeEndpoint) || "chat_completions",
      };
    }
  } catch {
    // Table missing (migration pending) or DB error — degrade gracefully.
  }
  return null;
}

async function saveModelPin(
  conversationKey: string,
  userId: string,
  provider: string,
  model: string,
  endpoint: OpenCodeEndpoint
): Promise<void> {
  try {
    await prisma.conversationModel.upsert({
      where: { conversationId: conversationKey },
      create: { conversationId: conversationKey, userId, provider, model, endpoint },
      update: { provider, model, endpoint },
    });
  } catch {
    // Non-fatal: stickiness is best-effort.
  }
}

// ── OpenAI → Anthropic message conversion (preserves tool structure) ────
// The old mapping collapsed every message to { role, content } and dropped
// tool_calls + the "tool" role entirely, mangling all tool context whenever a
// fallback landed on an Anthropic-format model (Qwen/MiniMax /messages, or
// Anthropic itself). This rebuilds proper tool_use / tool_result blocks.
function toAnthropicMessages(chatMsgs: any[]): any[] {
  const out: any[] = [];
  for (const m of chatMsgs) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const blocks: any[] = [];
      if (m.content) {
        blocks.push({ type: "text", text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) });
      }
      for (const tc of m.tool_calls) {
        let input: unknown = {};
        const rawArgs = tc.function?.arguments;
        try {
          input = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : (rawArgs || {});
        } catch {
          input = {};
        }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
      }
      out.push({ role: "assistant", content: blocks });
    } else if (m.role === "tool") {
      // Tool result → user turn with a tool_result block. Consecutive tool
      // results are merged into one user turn (Anthropic groups parallel
      // tool results together).
      const block = {
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
      };
      const prev = out[out.length - 1];
      if (prev && prev.role === "user" && Array.isArray(prev.content) &&
          prev.content.every((b: any) => b?.type === "tool_result")) {
        prev.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    } else {
      const content = typeof m.content === "string"
        ? m.content
        : (m.content == null ? "" : JSON.stringify(m.content));
      out.push({ role: m.role === "assistant" ? "assistant" : "user", content });
    }
  }
  return out;
}

function detectProvider(model: string): string {
  const m = model.toLowerCase();
  if (OPENCODE_GO_MODEL_IDS.includes(m)) return "opencode-go";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("moonshot") || m.includes("kimi")) return "moonshot";
  if (m.includes("minimax")) return "minimax";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("nvidia") || m.includes("stepfun") || m.includes("step-3.7")) return "nvidia";
  return "openai";
}

function isFluxAgentVirtualModel(model: string): boolean {
  return model.startsWith("omniworker");
}

export async function POST(request: Request) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[ChatCompletions:${requestId}] Request started`);

  // 0. Rate limiting
  const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
  const rateLimit = await checkRateLimit(ip, "chat");
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Intenta más tarde." },
      { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
    );
  }

  // 1. Auth
  console.log(`[ChatCompletions:${requestId}] Authenticating...`);
  const auth = await authenticateRequest(request);
  if (!auth) {
    console.log(`[ChatCompletions:${requestId}] Auth failed`);
    return NextResponse.json({ error: "No autorizado. Token requerido." }, { status: 401 });
  }
  console.log(`[ChatCompletions:${requestId}] Auth OK, user=${auth.user.email}, balance=${auth.user.tokenBalance}`);

  const { user } = auth;

  // 2. Check balance
  if (user.tokenBalance <= 0) {
    return NextResponse.json(
      { error: "Saldo de tokens insuficiente. Actualice su plan." },
      { status: 402 }
    );
  }

  // 3. Parse and Validate request
  let body;
  try {
    const rawBody = await request.json();
    const parsed = chatCompletionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Estructura de petición inválida", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    body = parsed.data;
    console.log(`[ChatCompletions:${requestId}] Body parsed, model=${body.model}, stream=${body.stream}, messages=${(body.messages || []).length}`);
  } catch {
    console.log(`[ChatCompletions:${requestId}] JSON parse failed`);
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const requestedModel = (body.model || "gpt-4o-mini").toLowerCase();
  const isStream = body.stream === true;

  // ── Session ID & Seed ────────────────────────────────────────────────
  const convSeed = conversationSeed(
    (body.messages as any[]) || [],
    String(user.id),
    (body as any).conversationId
  );
  const pinKey = (body as any).conversationId || `auto:${String(user.id)}:${convSeed}`;

  // ── Flux Agent virtual model handling ──────────────────────────────
  if (isFluxAgentVirtualModel(requestedModel)) {
    console.log(`[ChatCompletions:${requestId}] Virtual model path for ${requestedModel}`);
    // Fallback cascade: get ALL active providers, ordered by priority.
    // Same-priority providers are shuffled for load balancing,
    // then lower-priority providers are tried as fallback.
    const allProvidersRaw = await prisma.masterProvider.findMany({
      where: { isActive: true },
      orderBy: { priority: "asc" },
    });

    // ── Health filter (virtual path) ───────────────────────────────
    // Skip providers the 12h health checker marked as having no healthy
    // models (e.g. quota-exhausted opencode-go / z-ai). THIS is what makes
    // the checker actually protect routing: unhealthy providers are skipped
    // automatically and re-included the moment the checker sees them healthy
    // again — no manual isActive toggling needed, fully self-healing.
    // Falls back to ALL providers if none look healthy (stale data / first
    // run) or if the lookup errors, so routing never hard-fails on health.
    let allProviders = allProvidersRaw;
    try {
      const healthy: any[] = [];
      for (const p of allProvidersRaw) {
        const healthyModels = await getHealthyModels(prisma, p.provider);
        if (healthyModels.length > 0) {
          healthy.push(p);
        } else {
          console.log(`[HealthFilter] (virtual) skipping ${p.provider} — no healthy models`);
        }
      }
      if (healthy.length > 0) {
        const skipped = allProvidersRaw.length - healthy.length;
        if (skipped > 0) console.log(`[HealthFilter] (virtual) skipped ${skipped} unhealthy provider(s)`);
        allProviders = healthy;
      }
      // If ALL look unhealthy, keep allProvidersRaw as a last resort.
    } catch (healthErr) {
      console.warn("[HealthFilter] (virtual) failed, using all providers:", healthErr);
    }

    // The highest-priority HEALTHY provider drives auxiliary calls
    // (compaction, context bridge) so those never hit a dead provider.
    const topProvider = allProviders[0];
    if (!topProvider?.apiKey) {
      return NextResponse.json(
        { error: "No hay proveedores de IA configurados. Contacta al admin." },
        { status: 503 }
      );
    }

    // Group by priority, shuffle within each group, then flatten
    const priorityGroups = new Map<number, any[]>();
    for (const p of allProviders) {
      const group = priorityGroups.get(p.priority) || [];
      group.push(p);
      priorityGroups.set(p.priority, group);
    }
    const sortedPriorities = [...priorityGroups.keys()].sort((a, b) => a - b);

    // ── Model stickiness: stable seed + persistent pin ─────────────
    // The seed keeps provider/model selection deterministic per
    // conversation; the pin (if present) forces the exact provider+model
    // chosen on a previous turn, so the model never changes mid-task unless
    // it fails. pinKey prefers an explicit conversationId, else a stable hash.
    // convSeed is already defined globally

    // Seeded shuffle: same candidate order across turns of the SAME
    // conversation (prompt-cache affinity), varied across DIFFERENT
    // conversations (load balancing). Replaces the old Math.random() shuffle
    // that re-rolled the provider every turn and defeated provider caches.
    const _shuffleRng = mulberry32(convSeed);
    const shuffledCandidates: any[] = [];
    for (const pri of sortedPriorities) {
      const group = priorityGroups.get(pri)!;
      shuffledCandidates.push(...seededShuffle(group, _shuffleRng));
    }
    // pinKey is already defined globally
    const modelPin = await loadModelPin(pinKey);

    // ── Persistent Agent Memory: seed in-memory cache on cold start ────
    // If the context-bridge has no cached header for this session yet
    // (e.g. server restart, first message on a new tab) load the last
    // persisted header from PostgreSQL and pre-warm the cache so the model
    // always starts with full session context — not a blank slate.
    if (user.tenantId && body.messages && body.messages.length > 0) {
      try {
        const { headerCache, getCacheKey } = await import("@/lib/context-bridge");
        const cacheKey = getCacheKey(String(user.id), body.messages);
        if (!headerCache.has(cacheKey)) {
          const { loadAgentMemory } = await import("@/lib/agent-memory");
          const persistedHeader = await loadAgentMemory(prisma, user.tenantId, pinKey);
          if (persistedHeader) {
            headerCache.set(cacheKey, {
              header: persistedHeader,
              expiresAt: Date.now() + 15 * 60 * 1000,
            });
            console.log(`[AgentMemory] Seeded in-memory cache from PostgreSQL for session ${pinKey.slice(0, 16)}`);
          }
        }
      } catch (err) {
        console.error("[AgentMemory] Failed to seed memory (non-fatal):", err);
      }
    }
    if (modelPin) {
      // Move the pinned provider to the front of the cascade.
      const pinnedFirst = [
        ...shuffledCandidates.filter(p => p.provider === modelPin.provider),
        ...shuffledCandidates.filter(p => p.provider !== modelPin.provider),
      ];
      shuffledCandidates.length = 0;
      shuffledCandidates.push(...pinnedFirst);
      console.log(`[ModelPin] Conversation ${pinKey} pinned to ${modelPin.provider} (${modelPin.model})`);
    }

    // ── Anti-"dumb mid-task" guard ─────────────────────────────────
    // If we're mid tool-sequence and the conversation is pinned, do NOT
    // fall back to a different provider: handing a half-finished tool
    // exchange to a model that didn't start it breaks coherence. Lock the
    // cascade to the pinned provider only. If it's down, the request fails
    // cleanly (client retries) instead of returning an incoherent answer
    // from a different model.
    if (modelPin && isMidToolSequence((body.messages as any[]) || [])) {
      const pinnedOnly = shuffledCandidates.filter(p => p.provider === modelPin.provider);
      if (pinnedOnly.length > 0) {
        shuffledCandidates.length = 0;
        shuffledCandidates.push(...pinnedOnly);
        console.log(`[ToolSeqGuard] Mid tool-sequence — locked to pinned provider ${modelPin.provider} (no cross-model fallback)`);
      }
    }

    // ── Conversation compaction (virtual model path) ───────────────
    if (body.messages && body.messages.length > 30 && topProvider?.apiKey) {
      const userQuery = body.messages.filter((m: any) => m.role === "user").pop()?.content || "";
      let summaryModel: string;
      let summaryEndpoint: "chat_completions" | "messages" | undefined;
      if (topProvider.provider === "opencode-go") {
        const routing = intelligentModelSelect(body.messages, convSeed);
        summaryModel = routing.model;
        summaryEndpoint = routing.endpoint;
      } else {
        const dbModel = topProvider.defaultModel;
        summaryModel = (dbModel && dbModel !== "gpt-4o-mini" || topProvider.provider === "openai")
          ? dbModel
          : (DEFAULT_PROVIDER_MODELS[topProvider.provider] || "gpt-4o-mini");
      }
      const compacted = await compactMessages(body.messages, userQuery, {
        provider: topProvider.provider,
        apiKey: topProvider.apiKey,
        model: summaryModel,
        endpoint: summaryEndpoint,
      });
      console.log("[Compaction]", {
        before: body.messages.length,
        after: compacted.length,
        saved: `${Math.round((1 - compacted.length / body.messages.length) * 100)}%`,
      });
      body = { ...body, messages: compacted };
    }

    // ── Context Bridge: inject session continuity header ─────────────
    // When the conversation is long enough, generate (or cache) a compact
    // Context Header summarizing session state. This ensures that no matter
    // which model in the cascade responds, it has full knowledge of
    // decisions, files, and task state from the session.
    if (body.messages && body.messages.length >= 6 && topProvider?.apiKey) {
      try {
        const { getOrBuildContextHeader, injectContextHeader } = await import("@/lib/context-bridge");
        const dbModel = topProvider.defaultModel;
        const cbModel = (dbModel && dbModel !== "gpt-4o-mini" || topProvider.provider === "openai")
          ? dbModel
          : (DEFAULT_PROVIDER_MODELS[topProvider.provider] || "gpt-4o-mini");
        const cbConfig = {
          provider: topProvider.provider,
          apiKey: topProvider.apiKey,
          model: cbModel,
          endpoint: topProvider.provider === "opencode-go" ? ("chat_completions" as const) : undefined,
        };
        const contextHeader = await getOrBuildContextHeader(
          String(user.id),
          body.messages,
          cbConfig,
          pinKey,
          prisma,
          user.tenantId
        );
        if (contextHeader) {
          body = { ...body, messages: injectContextHeader(body.messages, contextHeader) };
          console.log("[ContextBridge] Header injected:", {
            summary: contextHeader.sessionSummary?.slice(0, 80),
            decisions: contextHeader.recentDecisions.length,
            entities: contextHeader.keyEntities.length,
            cached: Date.now() - contextHeader.generatedAt < 1000 ? "fresh" : "cached",
          });
        }
      } catch (cbErr) {
        // Context Bridge failures are non-fatal — the request proceeds without the header
        console.error("[ContextBridge] Failed (non-fatal):", cbErr);
      }
    }

    let aiResponse: Response | null = null;
    let selectedProvider: any = null;
    let selectedRealModel = "";
    let selectedEndpoint: OpenCodeEndpoint = "chat_completions";
    let selectedPayload: any = null;
    let selectedHeaders: any = null;
    let selectedUrl = "";
    let selectedPromptTokensEst = 0;
    let selectedCompletionTokensEst = 0;
    let selectedEstimatedCost = 0;
    let lastErrorDetails: any = null;

    for (const masterProvider of shuffledCandidates) {
      const targetProvider = masterProvider.provider;
      const targetUrl = PROVIDER_URLS[targetProvider];
      if (!targetUrl) continue;

      // Resolve real model: pinned model wins; else intelligent (seeded)
      // routing for OpenCode Go, default for others.
      let realModel: string;
      let routingTier = "default";
      let resolvedEndpoint: OpenCodeEndpoint = "chat_completions";
      const pinAppliesHere = modelPin && modelPin.provider === targetProvider;
      if (pinAppliesHere) {
        realModel = modelPin!.model;
        resolvedEndpoint = modelPin!.endpoint;
        routingTier = "pinned";
      } else if (targetProvider === "opencode-go") {
        const routing = intelligentModelSelect(body.messages || [], convSeed);
        realModel = routing.model;
        routingTier = routing.tier;
        resolvedEndpoint = routing.endpoint;
      } else {
        const dbModel = masterProvider.defaultModel;
        realModel = (dbModel && dbModel !== "gpt-4o-mini" || targetProvider === "openai")
          ? dbModel
          : (DEFAULT_PROVIDER_MODELS[targetProvider] || "gpt-4o-mini");
      }

      // Inject role-based system prompt for code mode
      const rolePrompt = FLUX_AGENT_ROLES[requestedModel] || null;
      let messages = body.messages || [];
      if (rolePrompt && messages.length > 0) {
        messages = [{ role: "system", content: rolePrompt }, ...messages];
      }

      // Fast path: simple greetings should not pay for the full system prompt.
      const _shouldTrim = isSimpleGreeting(messages);
      if (_shouldTrim) {
        const systemMsgs = messages.filter((m: any) => m.role === "system");
        if (systemMsgs.length > 0) {
          const systemContent = systemMsgs.map((m: any) => m.content).join("\n\n");
          const trimmed = trimSystemPrompt(systemContent);
          const nonSystemMsgs = messages.filter((m: any) => m.role !== "system");
          const firstUserIdx = nonSystemMsgs.findIndex((m: any) => m.role === "user");
          if (firstUserIdx >= 0) {
            messages = [...nonSystemMsgs];
            messages[firstUserIdx] = { ...messages[firstUserIdx], content: trimmed + "\n\n" + messages[firstUserIdx].content };
          } else {
            messages = [{ role: "user", content: trimmed }, ...nonSystemMsgs];
          }
        }
        // Greetings don't need tool definitions either — agent clients send
        // dozens of function schemas (~7K tokens) that ride along in `...body`.
        const _b = body as any;
        if (_b.tools || _b.functions) {
          const toolsChars = JSON.stringify(_b.tools || _b.functions).length;
          console.log(`[GreetingTrim] Stripping tools from greeting request (virtual path): ${toolsChars} chars`);
          const { tools: _t, tool_choice: _tc, functions: _f, function_call: _fc, ...rest } = _b;
          body = rest;
        }
      }

      // Resolve the actual URL — OpenCode Go models may use different endpoints
      let resolvedUrl = targetUrl;
      if (targetProvider === "opencode-go") {
        resolvedUrl = OPENCODE_GO_ENDPOINTS[resolvedEndpoint];
      }

      // Build provider-specific payload
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (targetProvider === "moonshot" || targetProvider === "kimi-code") {
        headers["User-Agent"] = "KimiCLI/1.5";
      }
      let payload: Record<string, unknown>;

      // Anthropic-format providers OR OpenCode Go models that use /messages endpoint
      const useAnthropicFormat = targetProvider === "anthropic" || 
        (targetProvider === "opencode-go" && resolvedEndpoint === "messages");

      if (useAnthropicFormat) {
        if (targetProvider === "anthropic") {
          headers["x-api-key"] = masterProvider.apiKey;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          // OpenCode Go /messages endpoint uses Bearer auth, but might require x-api-key for Anthropic compatibility
          headers["Authorization"] = `Bearer ${masterProvider.apiKey}`;
          headers["x-api-key"] = masterProvider.apiKey;
        }
        // Anthropic API format: system as top-level, no system in messages array
        const systemMsg = messages.find((m: any) => m.role === "system");
        const chatMsgs = messages.filter((m: any) => m.role !== "system");
        payload = {
          model: realModel,
          max_tokens: body.max_tokens || 4096,
          ...(systemMsg ? { system: systemMsg.content } : {}),
          messages: toAnthropicMessages(chatMsgs),
          stream: isStream,
        };
      } else {
        headers["Authorization"] = `Bearer ${masterProvider.apiKey}`;
        // Normalize system messages for providers that don't support "system" role
        // (e.g. OpenCode Go uses Pydantic validation allowing only "user"/"assistant").
        // Extract system content and prepend to first user message.
        const systemMsgs = messages.filter((m: { role: string; content: string }) => m.role === "system");
        const nonSystemMsgs = messages.filter((m: { role: string; content: string }) => m.role !== "system");
        
        let normalizedMessages = nonSystemMsgs;
        if (systemMsgs.length > 0) {
          const systemContent = systemMsgs.map((m: { role: string; content: string }) => m.content).join("\n\n");
          const firstUserIdx = normalizedMessages.findIndex((m: { role: string; content: string }) => m.role === "user");
          if (firstUserIdx >= 0) {
            normalizedMessages = [...normalizedMessages];
            normalizedMessages[firstUserIdx] = {
              ...normalizedMessages[firstUserIdx],
              content: systemContent + "\n\n" + normalizedMessages[firstUserIdx].content,
            };
          } else {
            // No user message yet — prepend system as user message
            normalizedMessages = [{ role: "user", content: systemContent }, ...normalizedMessages];
          }
        }
        payload = { ...body, model: realModel, messages: normalizedMessages };
      }

      // Dynamic cost estimation fallback (e.g. for streaming)
      const promptTokensEst = estimatePromptTokens((payload.messages as any[]) || []);
      const _virtIsGreeting = isSimpleGreeting(body.messages || []);
      const completionTokensEst = isStream
        ? (_virtIsGreeting ? Math.max(15, Math.floor(promptTokensEst * 0.2)) : Math.max(100, Math.floor(promptTokensEst * 0.3)))
        : 300;
      let estimatedCost = Math.max(5, promptTokensEst + completionTokensEst);

      // Light mode cap for short conversations
      const msgCount = (body.messages || []).length;
      if (msgCount <= 2) estimatedCost = Math.min(estimatedCost, 50);
      else if (msgCount <= 5) estimatedCost = Math.min(estimatedCost, 150);

      // Apply NVIDIA GLM-specific config (thinking with clear_thinking)
      payload = applyNvidiaGLMConfig(payload, realModel, targetProvider);

      console.log(`[Flux Agent Cloud] ${user.email} → trying provider ${targetProvider} (${realModel}) [${requestedModel}]`);
      console.log(`[ChatCompletions:${requestId}] Fetching provider ${targetProvider}, url=${resolvedUrl}`);

      try {
        const response = await fetchWithBackoff(resolvedUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        console.log(`[ChatCompletions:${requestId}] Provider ${targetProvider} responded status=${response.status}, ok=${response.ok}`);
        if (response.ok) {
          aiResponse = response;
          selectedProvider = masterProvider;
          selectedRealModel = realModel;
          selectedEndpoint = resolvedEndpoint;
          selectedPayload = payload;
          selectedHeaders = headers;
          selectedUrl = resolvedUrl;
          selectedPromptTokensEst = promptTokensEst;
          selectedCompletionTokensEst = completionTokensEst;
          selectedEstimatedCost = estimatedCost;
          break; // Success! Exit the candidates loop.
        } else {
          const errTxt = await response.text();
          console.warn(`[Flux Agent Cloud] Provider ${targetProvider} failed with status ${response.status}:`, errTxt);
          lastErrorDetails = { provider: targetProvider, status: response.status, error: errTxt };
        }
      } catch (err: any) {
        console.error(`[Flux Agent Cloud] Fetch error to provider ${targetProvider}:`, err);
        lastErrorDetails = { provider: targetProvider, error: err.message || String(err) };
      }
    }

    // Persist the model pin so the next turn reuses this exact provider/model.
    // Best-effort: if the table isn't migrated yet, saveModelPin no-ops.
    if (aiResponse && selectedProvider) {
      await saveModelPin(pinKey, String(user.id), selectedProvider.provider, selectedRealModel, selectedEndpoint);

      // ── Persistent Agent Memory: async save after successful response ─
      // Fire-and-forget: never awaited so it cannot add latency to the
      // response. If the context-bridge has a fresh header for this session
      // we persist it to PostgreSQL so the next cold start can resume it.
      if (user.tenantId) {
        void (async () => {
          try {
            const { getOrBuildContextHeader } = await import("@/lib/context-bridge");
            const { saveAgentMemory } = await import("@/lib/agent-memory");
            // Re-use the header that context-bridge already built (cached).
            const savedHeader = await getOrBuildContextHeader(
              String(user.id),
              (body.messages as any[]) || [],
              {
                provider: selectedProvider.provider,
                apiKey: selectedProvider.apiKey,
                model: selectedRealModel,
              },
              pinKey,
              prisma,
              user.tenantId
            );
            if (savedHeader) {
              await saveAgentMemory(prisma, {
                tenantId: user.tenantId!,
                sessionId: pinKey,
                userId: String(user.id),
                header: savedHeader,
                messages: (body.messages as any[]) || [],
                messageCount: ((body.messages as any[]) || []).length,
                lastModel: selectedRealModel,
              });
            }
          } catch {
            // Non-fatal: memory persistence failure should never affect the user.
          }
        })();
      }
    }

    if (!aiResponse || !selectedProvider) {
      // Log internally for debugging — never expose provider details to the client
      console.error("[Flux Agent Cloud] All providers failed:", JSON.stringify(lastErrorDetails));
      console.log(`[ChatCompletions:${requestId}] All providers failed, returning 502`);
      return NextResponse.json(
        { error: "El servicio no está disponible temporalmente. Intenta de nuevo más tarde." },
        { status: 502 }
      );
    }

    // Re-assign resolved values for downstream billing and logging
    const targetProvider = selectedProvider.provider;
    const realModel = selectedRealModel;
    const resolvedUrl = selectedUrl;
    const headers = selectedHeaders;
    const payload = selectedPayload;
    const promptTokensEst = selectedPromptTokensEst;
    const completionTokensEst = selectedCompletionTokensEst;
    const estimatedCost = selectedEstimatedCost;
    const masterProvider = selectedProvider;

    try {
      let finalCost = estimatedCost;
      let promptTokens = promptTokensEst;
      let completionTokens = completionTokensEst;
      let responseData: any = null;

      if (isStream) {
        if (auth.user.licenseId) {
          const deductResult = await prisma.license.updateMany({
            where: { id: auth.user.licenseId, tokenBalance: { gte: estimatedCost } },
            data: { tokenBalance: { decrement: estimatedCost } },
          });
          if (deductResult.count === 0) {
            return NextResponse.json({ error: "Saldo de tokens insuficiente." }, { status: 402 });
          }
        } else {
          const deductResult = await prisma.user.updateMany({
            where: { id: user.id, tokenBalance: { gte: estimatedCost } },
            data: { tokenBalance: { decrement: estimatedCost } },
          });
          if (deductResult.count === 0) {
            return NextResponse.json({ error: "Saldo de tokens insuficiente." }, { status: 402 });
          }
        }

        const counter = new SSETokenCounter(promptTokensEst);
        let reconciled = false;
        const reconcileOnce = async () => {
          if (reconciled) return;
          reconciled = true;
          try {
            await reconcileStreamBilling(
              user.id,
              user.licenseId || null,
              user.tenantId || null,
              requestedModel,
              promptTokensEst,
              estimatedCost,
              counter
            );
          } catch (err) {
            console.error("[Reconciliation Error]", err);
          }
        };

        request.signal.addEventListener("abort", () => {
          console.log("[Reconciliation] Client aborted connection, reconciling billing.");
          reconcileOnce();
        });

        console.log(`[ChatCompletions:${requestId}] Starting stream to client`);
        const bodyStream = aiResponse.body || new ReadableStream();
        const reader = bodyStream.getReader();
        const customStream = new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                console.log(`[ChatCompletions:${requestId}] Provider stream ended`);
                await reconcileOnce();
                try {
                  controller.close();
                } catch {}
                return;
              }
              counter.feed(value);
              try {
                controller.enqueue(sanitizeSSEChunk(value, realModel, requestedModel));
              } catch (enqueueErr) {
                console.warn("[Stream] Error enqueuing chunk:", enqueueErr);
                try {
                  await reader.cancel();
                } catch {}
                await reconcileOnce();
                try {
                  controller.close();
                } catch {}
              }
            } catch (err) {
              console.error("[Stream Error] Upstream connection dropped:", err);
              const encoder = new TextEncoder();
              const errorEvent = `data: ${JSON.stringify({ error: "Conexión interrumpida. Intenta de nuevo." })}\n\n`;
              try {
                controller.enqueue(encoder.encode(errorEvent));
              } catch {}
              await reconcileOnce();
              try {
                controller.close();
              } catch {}
            }
          },
          async cancel() {
            try {
              await reader.cancel();
            } catch (err) {
              console.log("[Stream] Reader cancel failed (likely already closed):", err.message || err);
            }
          }
        });

        console.log(`[ChatCompletions:${requestId}] Returning SSE stream to client`);
        return new Response(customStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Flux-Agent-Session-Id": pinKey,
          },
        });
      }

      // Non-stream path (usage-based deduction)
      try {
        responseData = await aiResponse.json();
        if (responseData && responseData.usage) {
          promptTokens = responseData.usage.prompt_tokens || promptTokens;
          completionTokens = responseData.usage.completion_tokens || completionTokens;
          finalCost = responseData.usage.total_tokens || finalCost;
        }
      } catch (e) {
        console.warn("Failed to parse response JSON for actual tokens", e);
      }

      if (auth.user.licenseId) {
        const deductResult = await prisma.license.updateMany({
          where: { id: auth.user.licenseId, tokenBalance: { gte: finalCost } },
          data: { tokenBalance: { decrement: finalCost } },
        });
        if (deductResult.count === 0) {
          return NextResponse.json(
            { error: "Saldo de tokens insuficiente." },
            { status: 402 }
          );
        }
      } else {
        const deductResult = await prisma.user.updateMany({
          where: { id: user.id, tokenBalance: { gte: finalCost } },
          data: { tokenBalance: { decrement: finalCost } },
        });
        if (deductResult.count === 0) {
          return NextResponse.json(
            { error: "Saldo de tokens insuficiente." },
            { status: 402 }
          );
        }
      }

      await prisma.taskLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          promptTokens: promptTokens,
          completionTks: completionTokens,
          modelUsed: requestedModel,
          taskType: requestedModel === "omniworker-code" ? "code_generation" : "cloud_reasoning",
          status: "completed",
        },
      });

      // Sanitize response: replace real model name with requested virtual model
      // so the client never sees which provider/model was actually used
      if (responseData && requestedModel) {
        responseData.model = requestedModel;
      }
      return NextResponse.json(responseData || {}, {
        headers: {
          "X-Flux-Agent-Session-Id": pinKey,
        },
      });
    } catch (error) {
      console.error(`[ChatCompletions:${requestId}] [LLM Gateway Error]`, error);
      await prisma.taskLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          promptTokens: 0,
          completionTks: 0,
          modelUsed: requestedModel,
          taskType: "cloud_reasoning",
          status: "failed",
        },
      });
      return NextResponse.json({ error: "Error interno del proxy IA" }, { status: 500 });
    }
  }

  // ── Standard (non-virtual) model handling ──────────────────────────
  const targetProvider = detectProvider(requestedModel);
  const targetUrl = PROVIDER_URLS[targetProvider];

  // Build a list of candidate providers: primary first, then fallbacks
  const allActiveProviders = await prisma.masterProvider.findMany({
    where: { isActive: true },
    orderBy: { priority: "asc" },
  });

  // Put the primary provider first, then remaining as fallbacks
  let candidateProviders = [
    ...allActiveProviders.filter(p => p.provider === targetProvider),
    ...allActiveProviders.filter(p => p.provider !== targetProvider && PROVIDER_URLS[p.provider]),
  ];

  // ── Health filter: skip providers with no healthy models ──────────
  try {
    const healthyProviderSet = new Set<string>();
    for (const p of candidateProviders) {
      const healthyModels = await getHealthyModels(prisma, p.provider);
      if (healthyModels.length > 0) {
        healthyProviderSet.add(p.provider);
      } else {
        console.log(`[HealthFilter] Skipping provider ${p.provider} (id=${p.id}) — no healthy models`);
      }
    }

    if (healthyProviderSet.size > 0) {
      const filtered = candidateProviders.filter(p => healthyProviderSet.has(p.provider));
      const skipped = candidateProviders.length - filtered.length;
      if (skipped > 0) {
        console.log(`[HealthFilter] Skipped ${skipped} unhealthy provider(s) from fallback loop`);
      }
      candidateProviders = filtered;
    }
    // If ALL providers are unhealthy, proceed with all candidates as last resort
    // (health data may be stale or this is the first run before any checks)
  } catch (healthErr) {
    console.warn("[HealthFilter] Health check failed, proceeding with all providers:", healthErr);
  }

  if (candidateProviders.length === 0) {
    return NextResponse.json(
      { error: "El servicio no está disponible temporalmente." },
      { status: 503 }
    );
  }

  // Resolve the actual endpoint format and URL for OpenCode Go standard models
  const catalogModel = OPENCODE_GO_CATALOG.find(m => m.id === requestedModel);
  const resolvedEndpoint = catalogModel ? catalogModel.endpoint : "chat_completions";
  const realModel = requestedModel; // standard path: user explicitly chose the model

  // Debug payload breakdown
  const debugMsgs = body.messages || [];
  console.log(`[DEBUG PAYLOAD] Total messages: ${debugMsgs.length}`);
  debugMsgs.forEach((msg: any, i: number) => {
    const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    console.log(`  - Msg ${i}: role=${msg.role}, char_len=${contentStr.length}, snippet=${contentStr.substring(0, 150).replace(/\s+/g, " ")}...`);
  });

  // ── Conversation compaction (standard path) — BEFORE estimation ─────
  if (body.messages && body.messages.length > 30 && candidateProviders.length > 0) {
    const primary = candidateProviders[0];
    const userQuery = body.messages.filter((m: any) => m.role === "user").pop()?.content || "";
    const compacted = await compactMessages(body.messages, userQuery, {
      provider: primary.provider,
      apiKey: primary.apiKey,
      model: requestedModel,
      endpoint: catalogModel ? catalogModel.endpoint : "chat_completions",
    });
    console.log("[Compaction]", {
      before: body.messages.length,
      after: compacted.length,
      saved: `${Math.round((1 - compacted.length / body.messages.length) * 100)}%`,
    });
    body = { ...body, messages: compacted };
  }

  // ── Greeting optimization (standard path) ────────────────────────
  const _stdIsGreeting = isSimpleGreeting(body.messages || []);
  if (_stdIsGreeting) {
    const msgs = body.messages || [];
    const systemMsgs = msgs.filter((m: any) => m.role === "system");
    if (systemMsgs.length > 0) {
      const trimmed = trimSystemPrompt(systemMsgs.map((m: any) => m.content).join("\n\n"));
      const nonSystemMsgs = msgs.filter((m: any) => m.role !== "system");
      const firstUserIdx = nonSystemMsgs.findIndex((m: any) => m.role === "user");
      if (firstUserIdx >= 0) {
        nonSystemMsgs[firstUserIdx] = { ...nonSystemMsgs[firstUserIdx], content: trimmed + "\n\n" + nonSystemMsgs[firstUserIdx].content };
        body = { ...body, messages: nonSystemMsgs };
      } else {
        body = { ...body, messages: [{ role: "user", content: trimmed }, ...nonSystemMsgs] };
      }
    }
    // Greetings don't need tool definitions either — agent clients send
    // dozens of function schemas (~7K tokens) that ride along in `...body`.
    const _b = body as any;
    if (_b.tools || _b.functions) {
      const toolsChars = JSON.stringify(_b.tools || _b.functions).length;
      console.log(`[GreetingTrim] Stripping tools from greeting request (standard path): ${toolsChars} chars`);
      const { tools: _t, tool_choice: _tc, functions: _f, function_call: _fc, ...rest } = _b;
      body = rest;
    }
  }

  // Dynamic cost estimation — AFTER compaction + greeting optimization
  const promptTokensEst = estimatePromptTokens(body.messages || []);
  const completionTokensEst = isStream
    ? (_stdIsGreeting ? Math.max(15, Math.floor(promptTokensEst * 0.2)) : Math.max(100, Math.floor(promptTokensEst * 0.3)))
    : 300;
  let estimatedCost = Math.max(5, promptTokensEst + completionTokensEst);

  // Light mode cap for short conversations
  const msgCount = (body.messages || []).length;
  if (msgCount <= 2) estimatedCost = Math.min(estimatedCost, 50);
  else if (msgCount <= 5) estimatedCost = Math.min(estimatedCost, 150);

  // ── Provider fallback loop ──────────────────────────────────────────
  // Try each candidate provider until one succeeds
  let lastProviderError: string | null = null;
  let aiResponse: Response | null = null;
  let usedProvider: typeof candidateProviders[0] | null = null;
  let usedUrl: string | null = null;

  for (const provider of candidateProviders) {
    const provName = provider.provider;
    const provUrl = PROVIDER_URLS[provName];
    if (!provUrl || !provider.apiKey) continue;

    // Resolve URL: opencode-go may use different endpoints
    let tryUrl = provUrl;
    if (provName === "opencode-go") {
      tryUrl = OPENCODE_GO_ENDPOINTS[resolvedEndpoint];
    }

    console.log(`[Flux Agent Cloud] ${user.email} → trying ${provName} (${requestedModel}) url=${tryUrl}`);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (provName === "moonshot" || provName === "kimi-code") {
        headers["User-Agent"] = "KimiCLI/1.5";
      }
      let payload: Record<string, unknown>;

      const useAnthropicFormat = provName === "anthropic" ||
        (provName === "opencode-go" && resolvedEndpoint === "messages");

      if (useAnthropicFormat) {
        if (provName === "anthropic") {
          headers["x-api-key"] = provider.apiKey;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["Authorization"] = `Bearer ${provider.apiKey}`;
          headers["x-api-key"] = provider.apiKey;
        }
        const msgs = body.messages || [];
        const systemMsg = msgs.find((m: any) => m.role === "system");
        const chatMsgs = msgs.filter((m: any) => m.role !== "system");
        payload = {
          model: requestedModel,
          max_tokens: body.max_tokens || 4096,
          ...(systemMsg ? { system: systemMsg.content } : {}),
          messages: toAnthropicMessages(chatMsgs),
          stream: isStream,
        };
      } else {
        headers["Authorization"] = `Bearer ${provider.apiKey}`;

        // Normalize system messages for providers that don't support "system" role
        let normalizedMessages = body.messages || [];
        if (provName === "opencode-go") {
          const msgs = body.messages || [];
          const systemMsgs = msgs.filter((m: { role: string; content: string }) => m.role === "system");
          const nonSystemMsgs = msgs.filter((m: { role: string; content: string }) => m.role !== "system");

          if (systemMsgs.length > 0) {
            const systemContent = systemMsgs.map((m: { role: string; content: string }) => m.content).join("\n\n");
            normalizedMessages = [...nonSystemMsgs];
            const firstUserIdx = normalizedMessages.findIndex((m: { role: string; content: string }) => m.role === "user");
            if (firstUserIdx >= 0) {
              normalizedMessages[firstUserIdx] = {
                ...normalizedMessages[firstUserIdx],
                content: systemContent + "\n\n" + normalizedMessages[firstUserIdx].content,
              };
            } else {
              normalizedMessages = [{ role: "user", content: systemContent }, ...normalizedMessages];
            }
          }
        }
        payload = { ...body, model: requestedModel, messages: normalizedMessages };
      }

      // Apply NVIDIA GLM-specific config (thinking with clear_thinking)
      payload = applyNvidiaGLMConfig(payload, requestedModel, provName);

      const resp = await fetchWithBackoff(tryUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        aiResponse = resp;
        usedProvider = provider;
        usedUrl = tryUrl;
        break; // Success — use this provider
      }

      // Provider returned an error — log and try next
      const errTxt = await resp.text();
      lastProviderError = errTxt;
      console.warn(`[Flux Agent Cloud] Provider ${provName} failed (${resp.status}): ${errTxt.substring(0, 200)}`);

      // Only break on non-retryable client errors.
      // 429 (rate limit), 401 (auth), 404 (model not found) → try next provider.
      // 400 (bad request) → the request itself is malformed, no point retrying.
      if (resp.status === 400) {
        break;
      }
    } catch (err: any) {
      lastProviderError = err.message;
      console.warn(`[Flux Agent Cloud] Provider ${provName} exception: ${err.message}`);
      // Continue to next provider
    }
  }

  if (!aiResponse) {
    console.error(`[Flux Agent Cloud] All providers failed. Last error: ${lastProviderError}`);
    return NextResponse.json(
      { error: "El servicio no está disponible temporalmente. Intenta de nuevo más tarde." },
      { status: 502 }
    );
  }

  // Log the provider that actually handled the request
  console.log(`[Flux Agent Cloud] ${user.email} → ${usedProvider!.provider} (${requestedModel}) url=${usedUrl}`);

  try {

      let finalCost = estimatedCost;
      let promptTokens = promptTokensEst;
      let completionTokens = completionTokensEst;
      let responseData: any = null;

      if (isStream) {
        if (auth.user.licenseId) {
          const deductResult = await prisma.license.updateMany({
            where: { id: auth.user.licenseId, tokenBalance: { gte: estimatedCost } },
            data: { tokenBalance: { decrement: estimatedCost } },
          });
          if (deductResult.count === 0) {
            return NextResponse.json({ error: "Saldo de tokens insuficiente." }, { status: 402 });
          }
        } else {
          const deductResult = await prisma.user.updateMany({
            where: { id: user.id, tokenBalance: { gte: estimatedCost } },
            data: { tokenBalance: { decrement: estimatedCost } },
          });
          if (deductResult.count === 0) {
            return NextResponse.json({ error: "Saldo de tokens insuficiente." }, { status: 402 });
          }
        }

        const counter = new SSETokenCounter(promptTokensEst);
        let reconciled = false;
        const reconcileOnce = async () => {
          if (reconciled) return;
          reconciled = true;
          try {
            await reconcileStreamBilling(
              user.id,
              user.licenseId || null,
              user.tenantId || null,
              requestedModel,
              promptTokensEst,
              estimatedCost,
              counter
            );
          } catch (err) {
            console.error("[Reconciliation Error]", err);
          }
        };

        request.signal.addEventListener("abort", () => {
          console.log("[Reconciliation] Client aborted connection, reconciling billing.");
          reconcileOnce();
        });

        console.log(`[ChatCompletions:${requestId}] Starting stream to client`);
        const bodyStream = aiResponse.body || new ReadableStream();
        const reader = bodyStream.getReader();
        const customStream = new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                console.log(`[ChatCompletions:${requestId}] Provider stream ended`);
                await reconcileOnce();
                try {
                  controller.close();
                } catch {}
                return;
              }
              counter.feed(value);
              try {
                controller.enqueue(sanitizeSSEChunk(value, realModel, requestedModel));
              } catch (enqueueErr) {
                console.warn("[Stream] Error enqueuing chunk:", enqueueErr);
                try {
                  await reader.cancel();
                } catch {}
                await reconcileOnce();
                try {
                  controller.close();
                } catch {}
              }
            } catch (err) {
              console.error("[Stream Error] Upstream connection dropped:", err);
              const encoder = new TextEncoder();
              const errorEvent = `data: ${JSON.stringify({ error: "Conexión interrumpida. Intenta de nuevo." })}\n\n`;
              try {
                controller.enqueue(encoder.encode(errorEvent));
              } catch {}
              await reconcileOnce();
              try {
                controller.close();
              } catch {}
            }
          },
          async cancel() {
            try {
              await reader.cancel();
            } catch (err) {
              console.log("[Stream] Reader cancel failed (likely already closed):", err.message || err);
            }
          }
        });

        console.log(`[ChatCompletions:${requestId}] Returning SSE stream to client`);
        return new Response(customStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Flux-Agent-Session-Id": pinKey,
          },
        });
      }

      // Non-stream path (usage-based deduction)
      try {
        responseData = await aiResponse.json();
        if (responseData && responseData.usage) {
          promptTokens = responseData.usage.prompt_tokens || promptTokens;
          completionTokens = responseData.usage.completion_tokens || completionTokens;
          finalCost = responseData.usage.total_tokens || finalCost;
        }
      } catch (e) {
        console.warn("Failed to parse response JSON for actual tokens", e);
      }

      if (auth.user.licenseId) {
        const deductResult = await prisma.license.updateMany({
          where: { id: auth.user.licenseId, tokenBalance: { gte: finalCost } },
          data: { tokenBalance: { decrement: finalCost } },
        });
        if (deductResult.count === 0) {
          return NextResponse.json(
            { error: "Saldo de tokens insuficiente." },
            { status: 402 }
          );
        }
      } else {
        const deductResult = await prisma.user.updateMany({
          where: { id: user.id, tokenBalance: { gte: finalCost } },
          data: { tokenBalance: { decrement: finalCost } },
        });
        if (deductResult.count === 0) {
          return NextResponse.json(
            { error: "Saldo de tokens insuficiente." },
            { status: 402 }
          );
        }
      }

      await prisma.taskLog.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          promptTokens: promptTokens,
          completionTks: completionTokens,
          modelUsed: requestedModel,
          taskType: "cloud_reasoning",
          status: "completed",
        },
      });

      return NextResponse.json(responseData || {}, {
        headers: {
          "X-Flux-Agent-Session-Id": pinKey,
        },
      });
  } catch (error) {
    console.error("[LLM Gateway Error]", error);

    await prisma.taskLog.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        promptTokens: 0,
        completionTks: 0,
        modelUsed: requestedModel,
        taskType: "cloud_reasoning",
        status: "failed",
      },
    });

    return NextResponse.json({ error: "Error interno del proxy IA" }, { status: 500 });
  }
}
