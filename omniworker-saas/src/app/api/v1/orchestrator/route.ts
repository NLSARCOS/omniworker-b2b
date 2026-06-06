// src/app/api/v1/orchestrator/route.ts — Per-tenant autonomous task queue
//
// Tenants enqueue tasks here; the cron endpoint (/api/cron/orchestrate)
// picks them up using PostgreSQL SELECT … FOR UPDATE SKIP LOCKED so
// multiple pods never process the same task twice.
//
// Auth: standard JWT — uses the same authenticateRequest as all routes.

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Helpers ───────────────────────────────────────────────────────────────

const VALID_AGENT_TYPES = new Set([
  "developer", "reviewer", "researcher", "data_analyst",
  "browser_agent", "marketer", "planner", "code_runner", "general_agent",
]);

const VALID_STATUSES = new Set(["pending", "in_progress", "done", "failed", "cancelled"]);

function validatePriority(p: unknown): number {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 5;
}

// ── POST — Create a new task ──────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!auth.user.tenantId) {
    return NextResponse.json(
      { error: "Solo usuarios con tenant pueden crear tareas del orquestador." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title || title.length > 500) {
    return NextResponse.json(
      { error: "El campo 'title' es requerido y debe tener menos de 500 caracteres." },
      { status: 400 }
    );
  }

  const agentType = VALID_AGENT_TYPES.has(String(body.agentType))
    ? String(body.agentType)
    : "general_agent";

  const task = await prisma.orchestratorTask.create({
    data: {
      tenantId: auth.user.tenantId,
      userId: auth.user.id,
      title,
      body: body.body ? String(body.body).slice(0, 50_000) : null,
      agentType,
      priority: validatePriority(body.priority),
      maxRetries: Number(body.maxRetries) > 0 ? Math.min(Number(body.maxRetries), 10) : 3,
    },
  });

  return NextResponse.json({ ok: true, task }, { status: 201 });
}

// ── GET — List tasks for this tenant ─────────────────────────────────────

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!auth.user.tenantId) {
    return NextResponse.json({ tasks: [] });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);

  const where: Record<string, unknown> = { tenantId: auth.user.tenantId };
  if (status && VALID_STATUSES.has(status)) where.status = status;

  const [tasks, total] = await Promise.all([
    prisma.orchestratorTask.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      select: {
        id: true, title: true, agentType: true, status: true,
        priority: true, retries: true, maxRetries: true,
        result: true, error: true,
        createdAt: true, completedAt: true,
      },
    }),
    prisma.orchestratorTask.count({ where }),
  ]);

  return NextResponse.json({ tasks, total, limit, offset });
}

// ── PATCH — Update task status (cancel, etc.) ────────────────────────────

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const taskId = String(body.id || "").trim();
  if (!taskId) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const task = await prisma.orchestratorTask.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  if (task.tenantId !== auth.user.tenantId && auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // Only allow cancelling pending tasks (not in_progress/done/failed)
  const newStatus = String(body.status || "");
  if (newStatus === "cancelled" && task.status !== "pending") {
    return NextResponse.json(
      { error: "Solo se pueden cancelar tareas en estado 'pending'." },
      { status: 409 }
    );
  }
  if (!VALID_STATUSES.has(newStatus)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const updated = await prisma.orchestratorTask.update({
    where: { id: taskId },
    data: { status: newStatus },
  });

  return NextResponse.json({ ok: true, task: updated });
}
