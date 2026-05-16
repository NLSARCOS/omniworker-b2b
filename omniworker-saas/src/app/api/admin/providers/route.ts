// src/app/api/admin/providers/route.ts — Multi-key providers CRUD
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const PROVIDER_OPTIONS = [
  { id: "openai",      label: "OpenAI",        baseUrl: null },
  { id: "anthropic",   label: "Anthropic",     baseUrl: null },
  { id: "deepseek",    label: "DeepSeek",      baseUrl: null },
  { id: "groq",        label: "Groq",          baseUrl: null },
  { id: "gemini",      label: "Google Gemini", baseUrl: null },
  { id: "mistral",     label: "Mistral",       baseUrl: null },
  { id: "cohere",      label: "Cohere",        baseUrl: null },
  { id: "together",    label: "Together AI",   baseUrl: null },
  { id: "ollama",      label: "Ollama (local)", baseUrl: "http://localhost:11434" },
  { id: "opencode-go", label: "OpenCode Go",   baseUrl: "https://opencode.ai/zen/go/v1" },
];

const OPENCODE_GO_MODELS = [
  { id: "glm-5.1",         label: "GLM-5.1",         sdk: "openai-compatible" },
  { id: "glm-5",           label: "GLM-5",            sdk: "openai-compatible" },
  { id: "kimi-k2.5",       label: "Kimi K2.5",        sdk: "openai-compatible" },
  { id: "kimi-k2.6",       label: "Kimi K2.6",        sdk: "openai-compatible" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro",  sdk: "openai-compatible" },
  { id: "deepseek-v4-flash","label": "DeepSeek V4 Flash", sdk: "openai-compatible" },
  { id: "mimo-v2.5",       label: "MiMo-V2.5",        sdk: "openai-compatible" },
  { id: "mimo-v2.5-pro",   label: "MiMo-V2.5-Pro",    sdk: "openai-compatible" },
  { id: "minimax-m2.7",    label: "MiniMax M2.7",     sdk: "anthropic" },
  { id: "minimax-m2.5",    label: "MiniMax M2.5",     sdk: "anthropic" },
  { id: "qwen3.6-plus",    label: "Qwen3.6 Plus",     sdk: "alibaba" },
  { id: "qwen3.5-plus",    label: "Qwen3.5 Plus",     sdk: "alibaba" },
];

function maskKey(key: string) {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 6) + "••••" + key.slice(-4);
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const providers = await prisma.masterProvider.findMany({
    orderBy: [{ provider: "asc" }, { priority: "asc" }],
  });

  return NextResponse.json({
    providers: providers.map((p) => ({
      ...p,
      apiKey: maskKey(p.apiKey),
    })),
    availableProviders: PROVIDER_OPTIONS,
    openCodeGoModels: OPENCODE_GO_MODELS,
  });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const rateLimit = await checkRateLimit(ip, "admin");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, provider, apiKey, isActive, priority, dailyLimit, notes } = body;
  if (!name || !provider || !apiKey) {
    return NextResponse.json({ error: "name, provider y apiKey son requeridos" }, { status: 400 });
  }

  const created = await prisma.masterProvider.create({
    data: {
      name,
      provider,
      apiKey,
      isActive: isActive ?? true,
      priority: priority ?? 1,
      dailyLimit: dailyLimit || null,
      notes: notes || null,
    },
  });

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "CREATE_PROVIDER", target: created.id, details: JSON.stringify({ name, provider }) },
  });

  return NextResponse.json({ success: true, id: created.id });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  // Don't update apiKey if it's a masked value
  if (data.apiKey && data.apiKey.includes("••••")) {
    delete data.apiKey;
  }

  const updated = await prisma.masterProvider.update({ where: { id }, data });

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "UPDATE_PROVIDER", target: id },
  });

  return NextResponse.json({ success: true, id: updated.id });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  await prisma.masterProvider.delete({ where: { id } });

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "DELETE_PROVIDER", target: id },
  });

  return NextResponse.json({ success: true });
}
