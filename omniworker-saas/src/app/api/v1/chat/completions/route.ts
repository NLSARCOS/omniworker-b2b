// src/app/api/v1/chat/completions/route.ts — LLM Gateway multi-tenant
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Provider → URL mapping
const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/chat/completions",
  moonshot: "https://api.moonshot.cn/v1/chat/completions",
  minimax: "https://api.minimax.chat/v1/text/chatcompletion_v2",
  "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
};

function detectProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("opencode")) return "opencode-go";
  if (m.includes("moonshot") || m.includes("kimi")) return "moonshot";
  if (m.includes("minimax")) return "minimax";
  if (m.includes("claude")) return "anthropic";
  return "openai";
}

export async function POST(request: Request) {
  // 1. Auth
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado. Token requerido." }, { status: 401 });
  }

  const { user, payload } = auth;

  // 2. Check balance
  if (user.tokenBalance <= 0) {
    return NextResponse.json(
      { error: "Saldo de tokens insuficiente. Actualice su plan." },
      { status: 402 }
    );
  }

  // 3. Parse request
  const body = await request.json();
  const requestedModel = (body.model || "gpt-4o-mini").toLowerCase();
  const targetProvider = detectProvider(requestedModel);
  const targetUrl = PROVIDER_URLS[targetProvider];
  const isStream = body.stream === true;

  // 4. Get master API key for provider
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

  // 5. Billing: estimate cost (simplified — fixed per request)
  const estimatedCost = 50;

  // 6. Call AI provider
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (targetProvider === "anthropic") {
      headers["x-api-key"] = masterProvider.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${masterProvider.apiKey}`;
    }

    const aiResponse = await fetch(targetUrl, {
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

    // 7. Deduct tokens + log
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenBalance: { decrement: estimatedCost } },
    });

    await prisma.taskLog.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        promptTokens: estimatedCost,
        completionTks: 0,
        modelUsed: requestedModel,
        taskType: "cloud_reasoning",
        status: "completed",
      },
    });

    // 8. Return response (stream or json)
    if (isStream) {
      return new Response(aiResponse.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await aiResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[LLM Gateway Error]", error);

    // Log failed task
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

    return NextResponse.json(
      { error: "Error interno del proxy IA" },
      { status: 500 }
    );
  }
}
