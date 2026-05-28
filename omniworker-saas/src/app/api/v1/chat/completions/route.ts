import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatCompletionSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchWithBackoff } from "@/lib/fetch-backoff";

// Provider → URL mapping
const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/chat/completions",
  moonshot: "https://api.moonshot.cn/v1/chat/completions",
  minimax: "https://api.minimax.chat/v1/text/chatcompletion_v2",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
};

// OpenCode Go has two endpoint formats depending on the model
const OPENCODE_GO_ENDPOINTS = {
  chat_completions: "https://opencode.ai/zen/go/v1/chat/completions",
  messages: "https://opencode.ai/zen/go/v1/messages",
} as const;

type OpenCodeEndpoint = keyof typeof OPENCODE_GO_ENDPOINTS;

// OmniWorker virtual models → role-based system prompts
const OMNIWORKER_ROLES: Record<string, string> = {
  "omniworker-code": `You are OmniWorker Code, an expert software engineer and coding assistant.
You write clean, efficient, well-documented code.
Always prefer production-quality solutions with proper error handling.
When fixing bugs, explain the root cause. When suggesting code, include complete examples.
Languages, frameworks, and tools: you are fluent in all of them.`,
};

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

  let refundAmount = 0;
  if (estimatedCost > actualCost) {
    const diff = estimatedCost - actualCost;
    if (diff > actualCost * 0.10) {
      refundAmount = diff;
    }
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
  const fullText = JSON.stringify(messages || []);
  const totalChars = fullText.length;
  if (totalChars === 0) return 0;

  let nonAsciiCount = 0;
  for (let i = 0; i < totalChars; i++) {
    if (fullText.charCodeAt(i) > 127) {
      nonAsciiCount++;
    }
  }

  const isNonAsciiHeavy = (nonAsciiCount / totalChars) > 0.3;
  const multiplier = isNonAsciiHeavy ? 1.5 : 1.0;

  const baseTokens = Math.max(10, Math.floor(totalChars / 4));
  return Math.floor(baseTokens * multiplier);
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
  { id: "qwen3.6-plus",    label: "Qwen3.6 Plus",     tier: "reasoning", weight: 2, endpoint: "chat_completions" },
  { id: "minimax-m2.7",    label: "MiniMax M2.7",     tier: "reasoning", weight: 1, endpoint: "messages" },
  // Tier: BALANCED — general purpose, mid-complexity
  { id: "glm-5",           label: "GLM-5",            tier: "balanced",  weight: 3, endpoint: "chat_completions" },
  { id: "kimi-k2.5",       label: "Kimi K2.5",        tier: "balanced",  weight: 3, endpoint: "chat_completions" },
  { id: "mimo-v2.5",       label: "MiMo-V2.5",        tier: "balanced",  weight: 2, endpoint: "chat_completions" },
  { id: "qwen3.5-plus",    label: "Qwen3.5 Plus",     tier: "balanced",  weight: 2, endpoint: "chat_completions" },
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

  // Map score to tier
  if (score >= 5) return "reasoning";
  if (score >= 2) return "balanced";
  return "speed";
}

/**
 * Weighted random selection within a tier.
 * Models with higher weight are picked proportionally more often.
 */
function selectModelFromTier(tier: "reasoning" | "balanced" | "speed"): ModelTier {
  const candidates = OPENCODE_GO_CATALOG.filter(m => m.tier === tier);
  const totalWeight = candidates.reduce((sum, m) => sum + m.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const model of candidates) {
    random -= model.weight;
    if (random <= 0) return model;
  }
  
  return candidates[0]; // fallback
}

/**
 * Intelligent OpenCode Go model selection.
 * Returns { model, tier, endpoint } for routing and observability.
 */
function intelligentModelSelect(messages: { role: string; content: string }[]): { model: string; tier: string; endpoint: OpenCodeEndpoint } {
  const tier = classifyPromptComplexity(messages);
  const selected = selectModelFromTier(tier);
  return { model: selected.id, tier, endpoint: selected.endpoint };
}

function detectProvider(model: string): string {
  const m = model.toLowerCase();
  if (OPENCODE_GO_MODEL_IDS.includes(m)) return "opencode-go";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("moonshot") || m.includes("kimi")) return "moonshot";
  if (m.includes("minimax")) return "minimax";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("nvidia")) return "nvidia";
  return "openai";
}

function isOmniWorkerVirtualModel(model: string): boolean {
  return model.startsWith("omniworker");
}

export async function POST(request: Request) {
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
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado. Token requerido." }, { status: 401 });
  }

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
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const requestedModel = (body.model || "gpt-4o-mini").toLowerCase();
  const isStream = body.stream === true;

  // ── OmniWorker virtual model handling ──────────────────────────────
  if (isOmniWorkerVirtualModel(requestedModel)) {
    // Find the first active master provider (priority order)
    const masterProvider = await prisma.masterProvider.findFirst({
      where: { isActive: true },
      orderBy: { priority: "asc" },
    });

    if (!masterProvider?.apiKey) {
      return NextResponse.json(
        { error: "No hay proveedores de IA configurados. Contacta al admin." },
        { status: 503 }
      );
    }

    const targetProvider = masterProvider.provider;
    const targetUrl = PROVIDER_URLS[targetProvider];
    if (!targetUrl) {
      return NextResponse.json(
        { error: `Proveedor ${targetProvider} no soportado` },
        { status: 503 }
      );
    }

    // Resolve real model: intelligent routing for OpenCode Go, default for others
    let realModel: string;
    let routingTier = "default";
    let resolvedEndpoint: OpenCodeEndpoint = "chat_completions";
    if (targetProvider === "opencode-go") {
      const routing = intelligentModelSelect(body.messages || []);
      realModel = routing.model;
      routingTier = routing.tier;
      resolvedEndpoint = routing.endpoint;
    } else {
      realModel = masterProvider.defaultModel || "gpt-4o-mini";
    }

    // Inject role-based system prompt for code mode
    const rolePrompt = OMNIWORKER_ROLES[requestedModel] || null;
    let messages = body.messages || [];
    if (rolePrompt && messages.length > 0) {
      // Prepend role system prompt
      messages = [{ role: "system", content: rolePrompt }, ...messages];
    }

    // Resolve the actual URL — OpenCode Go models may use different endpoints
    let resolvedUrl = targetUrl;
    if (targetProvider === "opencode-go") {
      resolvedUrl = OPENCODE_GO_ENDPOINTS[resolvedEndpoint];
    }

    console.log(`[OmniWorker Cloud] ${user.email} → ${targetProvider} (${realModel}) [${requestedModel}] tier=${routingTier} endpoint=${resolvedEndpoint}`);

    // Build provider-specific payload
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let payload: Record<string, unknown>;

    // Anthropic-format providers OR OpenCode Go models that use /messages endpoint
    const useAnthropicFormat = targetProvider === "anthropic" || 
      (targetProvider === "opencode-go" && resolvedEndpoint === "messages");

    if (useAnthropicFormat) {
      if (targetProvider === "anthropic") {
        headers["x-api-key"] = masterProvider.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        // OpenCode Go /messages endpoint uses Bearer auth
        headers["Authorization"] = `Bearer ${masterProvider.apiKey}`;
      }
      // Anthropic API format: system as top-level, no system in messages array
      const systemMsg = messages.find((m: { role: string; content: string }) => m.role === "system");
      const chatMsgs = messages.filter((m: { role: string; content: string }) => m.role !== "system");
      payload = {
        model: realModel,
        max_tokens: body.max_tokens || 4096,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: chatMsgs.map((m: { role: string; content: string }) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
        stream: isStream,
      };
    } else {
      headers["Authorization"] = `Bearer ${masterProvider.apiKey}`;
      payload = { ...body, model: realModel, messages };
    }

    // Dynamic cost estimation fallback (e.g. for streaming)
    const promptTokensEst = estimatePromptTokens((payload.messages as any[]) || []);
    const completionTokensEst = isStream ? Math.max(100, Math.floor(promptTokensEst * 0.3)) : 300;
    const estimatedCost = Math.max(10, promptTokensEst + completionTokensEst);

    try {
      const aiResponse = await fetchWithBackoff(resolvedUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!aiResponse.ok) {
        const errTxt = await aiResponse.text();
        console.error(`[OmniWorker Cloud] Error ${targetProvider}:`, errTxt);
        return NextResponse.json(
          { error: `Error del proveedor (${targetProvider})` },
          { status: 502 }
        );
      }

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

        const bodyStream = aiResponse.body || new ReadableStream();
        const reader = bodyStream.getReader();
        const customStream = new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                await reconcileOnce();
                controller.close();
                return;
              }
              counter.feed(value);
              controller.enqueue(value);
            } catch (err) {
              console.error("[Stream Error] Upstream connection dropped:", err);
              const encoder = new TextEncoder();
              const errorEvent = `data: ${JSON.stringify({ error: "Provider connection lost" })}\n\n`;
              controller.enqueue(encoder.encode(errorEvent));
              await reconcileOnce();
              try {
                controller.close();
              } catch {}
            }
          },
          async cancel() {
            await reader.cancel();
          }
        });

        return new Response(customStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
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

      return NextResponse.json(responseData || {});
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

  // ── Standard (non-virtual) model handling ──────────────────────────
  const targetProvider = detectProvider(requestedModel);
  const targetUrl = PROVIDER_URLS[targetProvider];

  const masterProvider = await prisma.masterProvider.findFirst({
    where: { isActive: true, provider: targetProvider },
  });

  if (!masterProvider?.apiKey) {
    return NextResponse.json(
      { error: `Proveedor ${targetProvider} no disponible` },
      { status: 503 }
    );
  }

  console.log(`[OmniWorker Cloud] ${user.email} → ${targetProvider} (${requestedModel})`);

    // Dynamic cost estimation fallback (e.g. for streaming)
    const promptTokensEst = estimatePromptTokens(body.messages || []);
    const completionTokensEst = isStream ? Math.max(100, Math.floor(promptTokensEst * 0.3)) : 300;
    const estimatedCost = Math.max(10, promptTokensEst + completionTokensEst);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (targetProvider === "anthropic") {
        headers["x-api-key"] = masterProvider.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["Authorization"] = `Bearer ${masterProvider.apiKey}`;
      }

      const aiResponse = await fetchWithBackoff(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body, model: requestedModel }),
      });

      if (!aiResponse.ok) {
        const errTxt = await aiResponse.text();
        console.error(`[OmniWorker Cloud] Error ${targetProvider}:`, errTxt);
        return NextResponse.json(
          { error: `Error del proveedor (${targetProvider})` },
          { status: 502 }
        );
      }

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

        const bodyStream = aiResponse.body || new ReadableStream();
        const reader = bodyStream.getReader();
        const customStream = new ReadableStream({
          async pull(controller) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                await reconcileOnce();
                controller.close();
                return;
              }
              counter.feed(value);
              controller.enqueue(value);
            } catch (err) {
              console.error("[Stream Error] Upstream connection dropped:", err);
              const encoder = new TextEncoder();
              const errorEvent = `data: ${JSON.stringify({ error: "Provider connection lost" })}\n\n`;
              controller.enqueue(encoder.encode(errorEvent));
              await reconcileOnce();
              try {
                controller.close();
              } catch {}
            }
          },
          async cancel() {
            await reader.cancel();
          }
        });

        return new Response(customStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
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

      return NextResponse.json(responseData || {});
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
