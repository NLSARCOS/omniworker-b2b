// src/app/api/admin/tenants/route.ts — CRUD Tenants (superadmin)
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenants = await prisma.tenant.findMany({
    include: {
      plan: { select: { name: true, tokenLimit: true } },
      _count: { select: { users: true, edgeAgents: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      isActive: t.isActive,
      plan: t.plan?.name ?? null,
      tokenLimit: t.plan?.tokenLimit ?? 0,
      users: t._count.users,
      agents: t._count.edgeAgents,
      createdAt: t.createdAt,
    })),
  });
}

// Update tenant (plan, status, etc.)
export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { tenantId, planId, isActive } = body;

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId requerido" }, { status: 400 });
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(planId !== undefined ? { planId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    include: { plan: true },
  });

  return NextResponse.json({ success: true, tenant });
}
