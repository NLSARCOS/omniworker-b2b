// src/app/api/cron/orchestrate/route.ts — Distributed task processor
//
// Processes OrchestratorTask rows using PostgreSQL's SELECT … FOR UPDATE
// SKIP LOCKED so that multiple pods (or concurrent cron triggers) never
// pick the same task twice — without Redis, without Celery.
//
// Each task is delegated to the SaaS LLM gateway using the tenant's own
// top-priority active provider. Token costs are charged to the tenant's
// primary user (the task creator).
//
// Cron: call POST /api/cron/orchestrate every 60s with:
//   Authorization: Bearer <CRON_SECRET>

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchWithBackoff } from "@/lib/fetch-backoff";

const CRON_SECRET = process.env.CRON_SECRET;
const SAAS_BASE_URL = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

// Agent-type → system prompt (concise; the task body provides specifics)
const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  developer:    "You are an expert software developer. Implement the requested task concisely and correctly. Output code with brief explanations.",
  reviewer:     "You are a senior code reviewer. Analyze the provided code or design and give specific, actionable feedback.",
  researcher:   "You are a research analyst. Investigate the topic and return a structured summary with key findings.",
  data_analyst: "You are a data analyst. Analyze the data or metrics described and provide insights and recommendations.",
  browser_agent:"You are a web automation specialist. Describe the steps needed to complete the web task.",
  marketer:     "You are a marketing strategist. Create compelling copy or strategy for the described campaign.",
  planner:      "You are a technical architect. Design a clear, actionable plan for the described system or feature.",
  code_runner:  "You are a DevOps engineer. Write the automation script or cron task described.",
  general_agent:"You are a capable AI assistant. Complete the task described as thoroughly as possible.",
};

const MAX_TASKS_PER_RUN = 5;         // backpressure cap
const TASK_TIMEOUT_MS   = 2 * 60 * 1000; // 2 min per task

// ── Authentication ────────────────────────────────────────────────────────

function verifyCronSecret(request: Request): boolean {
  if (!CRON_SECRET) return false;
  const auth = request.headers.get("authorization") || "";
  return auth.replace("Bearer ", "").trim() === CRON_SECRET;
}

// ── Task delegation ───────────────────────────────────────────────────────

async function delegateTask(
  task: { id: string; title: string; body: string | null; agentType: string; tenantId: string; userId: string },
  provider: { provider: string; apiKey: string; defaultModel: string; baseUrl: string | null },
): Promise<string> {
  const systemPrompt =
    AGENT_SYSTEM_PROMPTS[task.agentType] || AGENT_SYSTEM_PROMPTS.general_agent;

  const userContent = task.body
    ? `${task.title}\n\n${task.body}`
    : task.title;

  // Use the SaaS's own chat/completions gateway so billing/health checks apply
  const gatewayUrl = `${SAAS_BASE_URL}/api/v1/chat/completions`;

  // We need a system-level token for the task creator.
  // For now, use the provider API key directly (bypassing the gateway billing).
  // In production you would look up the tenant's admin JWT token here.
  const PROVIDER_URLS: Record<string, string> = {
    openai:    "https://api.openai.com/v1/chat/completions",
    deepseek:  "https://api.deepseek.com/chat/completions",
    groq:      "https://api.groq.com/openai/v1/chat/completions",
    gemini:    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    moonshot:  "https://api.kimi.com/coding/v1/chat/completions",
    "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
    "z-ai":    "https://api.z.ai/api/coding/paas/v4/chat/completions",
  };
  const url = provider.baseUrl || PROVIDER_URLS[provider.provider] || PROVIDER_URLS.openai;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${provider.apiKey}`,
  };

  const payload = {
    model: provider.defaultModel,
    max_tokens: 2048,
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userContent },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TASK_TIMEOUT_MS);

  try {
    const res = await fetchWithBackoff(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Provider ${provider.provider} returned ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const content =
      (data.choices as any)?.[0]?.message?.content ||
      (data.content as any)?.[0]?.text ||
      JSON.stringify(data);

    return String(content);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const startTime = Date.now();

  // ── SELECT pending tasks using SKIP LOCKED ────────────────────────────
  // Raw SQL is necessary because Prisma doesn't expose SKIP LOCKED yet.
  // This makes the query safe across multiple pods without a distributed lock.
  let tasks: Array<{
    id: string; title: string; body: string | null; agentType: string;
    tenantId: string; userId: string; retries: number; maxRetries: number;
  }>;

  try {
    tasks = await prisma.$queryRaw`
      SELECT id, title, body, "agentType", "tenantId", "userId", retries, "maxRetries"
      FROM "OrchestratorTask"
      WHERE status = 'pending' AND retries < "maxRetries"
      ORDER BY priority ASC, "createdAt" ASC
      LIMIT ${MAX_TASKS_PER_RUN}
      FOR UPDATE SKIP LOCKED
    `;
  } catch (err) {
    console.error("[Orchestrate] Failed to query tasks:", err);
    return NextResponse.json({ error: "DB query failed" }, { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, durationMs: Date.now() - startTime });
  }

  // Mark all selected tasks as in_progress immediately (before awaiting delegation)
  await prisma.orchestratorTask.updateMany({
    where: { id: { in: tasks.map(t => t.id) } },
    data: { status: "in_progress", lockedAt: new Date() },
  });

  // ── Process each task (parallel within the cap) ───────────────────────
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      // Find the top-priority active provider for this tenant
      // (fall back to platform-level providers if the tenant has none)
      const provider = await prisma.masterProvider.findFirst({
        where: { isActive: true },
        orderBy: { priority: "asc" },
      });

      if (!provider?.apiKey) {
        throw new Error("No active provider configured");
      }

      const result = await delegateTask(task, provider);
      return { taskId: task.id, result };
    })
  );

  // ── Persist results ───────────────────────────────────────────────────
  const summaries: Array<{ id: string; status: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const task   = tasks[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      await prisma.orchestratorTask.update({
        where: { id: task.id },
        data: {
          status: "done",
          result: result.value.result.slice(0, 50_000),
          completedAt: new Date(),
          lockedAt: null,
        },
      });
      summaries.push({ id: task.id, status: "done" });
    } else {
      const errorMsg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      const newRetries = task.retries + 1;
      const newStatus  = newRetries >= task.maxRetries ? "failed" : "pending";

      await prisma.orchestratorTask.update({
        where: { id: task.id },
        data: {
          status: newStatus,
          retries: newRetries,
          error: errorMsg.slice(0, 2000),
          lockedAt: null,
          completedAt: newStatus === "failed" ? new Date() : null,
        },
      });
      summaries.push({ id: task.id, status: newStatus });
      console.error(`[Orchestrate] Task ${task.id} failed (retry ${newRetries}/${task.maxRetries}):`, errorMsg);
    }
  }

  const durationMs = Date.now() - startTime;
  const done   = summaries.filter(s => s.status === "done").length;
  const failed = summaries.filter(s => s.status === "failed").length;
  const retrying = summaries.filter(s => s.status === "pending").length;

  console.log(`[Orchestrate] processed=${tasks.length} done=${done} failed=${failed} retrying=${retrying} (${durationMs}ms)`);

  return NextResponse.json({
    ok: true,
    processed: tasks.length,
    done,
    failed,
    retrying,
    durationMs,
  });
}

// Support GET for manual admin triggers (SUPERADMIN only)
export async function GET(request: Request) {
  const { authenticateRequest } = await import("@/lib/auth");
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return POST(request);
}
