// src/app/api/admin/providers/test/route.ts — Test provider API key connectivity
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Provider → test endpoint mapping
const PROVIDER_TEST_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  cohere: "https://api.cohere.ai/v2/chat",
  together: "https://api.together.xyz/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
  ollama: "http://localhost:11434/v1/chat/completions",
  moonshot: "https://api.kimi.com/coding/v1/chat/completions",
  "z-ai": "https://api.z.ai/api/coding/paas/v4/chat/completions",
};

// Default test model for each provider
const PROVIDER_TEST_MODELS: Record<string, string> = {
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
  "z-ai": "glm-5",
};

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: { providerId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { providerId } = body;
  if (!providerId) {
    return NextResponse.json({ error: "providerId requerido" }, { status: 400 });
  }

  // Fetch provider with real API key from DB
  const provider = await prisma.masterProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    return NextResponse.json({ error: "Provider no encontrado" }, { status: 404 });
  }

  const testUrl = PROVIDER_TEST_URLS[provider.provider];
  if (!testUrl) {
    return NextResponse.json({
      error: `Provider "${provider.provider}" no tiene URL de test configurada`,
    }, { status: 400 });
  }

  const testModel = (provider.defaultModel && provider.defaultModel !== "gpt-4o-mini" || provider.provider === "openai")
    ? provider.defaultModel
    : (PROVIDER_TEST_MODELS[provider.provider] || "gpt-4o-mini");

  const startTime = Date.now();
  try {

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.provider === "moonshot") {
      headers["User-Agent"] = "KimiCLI/1.5";
    }
    let payload: Record<string, unknown>;

    if (provider.provider === "anthropic") {
      // Anthropic uses x-api-key header and different format
      headers["x-api-key"] = provider.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      payload = {
        model: testModel,
        max_tokens: 30,
        messages: [{ role: "user", content: "Say hello in 5 words." }],
      };
    } else {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      payload = {
        model: testModel,
        max_tokens: 30,
        messages: [{ role: "user", content: "Say hello in 5 words." }],
        stream: false,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45s timeout

    const res = await fetch(testUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text().catch(() => "No response body");
      let errorDetail = errText;
      try {
        const errJson = JSON.parse(errText);
        errorDetail = errJson.error?.message || errJson.error || errText;
      } catch {
        // Use raw text
      }

      return NextResponse.json({
        success: false,
        status: res.status,
        latencyMs,
        error: errorDetail,
        model: testModel,
      });
    }

    const data = await res.json();

    // Extract response text based on provider format
    let responseText = "";
    if (provider.provider === "anthropic") {
      responseText = data.content?.[0]?.text || "";
    } else {
      responseText = data.choices?.[0]?.message?.content || "";
    }

    return NextResponse.json({
      success: true,
      status: 200,
      latencyMs,
      model: data.model || testModel,
      response: responseText.slice(0, 100),
      usage: data.usage || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = message.includes("abort");
    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: false,
      status: 0,
      latencyMs,
      error: isTimeout ? `Timeout: el proveedor no respondió en ${Math.round(latencyMs / 1000)} segundos` : message,
      model: testModel,
    });
  }
}
