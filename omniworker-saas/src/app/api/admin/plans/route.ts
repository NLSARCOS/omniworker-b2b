// src/app/api/admin/plans/route.ts — Plan CRUD (superadmin)
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { tenants: true } } },
  });

  return NextResponse.json({ plans });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, description, tokenLimit, maxAgents, maxUsers, price, billingPeriod, isPublic, features, sortOrder } = body;

  if (!name || tokenLimit === undefined || price === undefined) {
    return NextResponse.json({ error: "name, tokenLimit y price son requeridos" }, { status: 400 });
  }

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name,
      description: description || null,
      tokenLimit: parseInt(tokenLimit),
      maxAgents: parseInt(maxAgents ?? 1),
      maxUsers: parseInt(maxUsers ?? 1),
      price: parseFloat(price),
      billingPeriod: billingPeriod || "monthly",
      isPublic: isPublic ?? true,
      features: JSON.stringify(features || []),
      sortOrder: parseInt(sortOrder ?? 0),
    },
  });

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "CREATE_PLAN", target: plan.id, details: JSON.stringify({ name, price }) },
  });

  return NextResponse.json({ success: true, plan });
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

  const { id, features, ...rest } = body;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const updateData: Record<string, unknown> = { ...rest as object };
  if (features !== undefined) updateData.features = JSON.stringify(features);
  if (rest.tokenLimit !== undefined) updateData.tokenLimit = parseInt(rest.tokenLimit);
  if (rest.maxAgents !== undefined) updateData.maxAgents = parseInt(rest.maxAgents);
  if (rest.maxUsers !== undefined) updateData.maxUsers = parseInt(rest.maxUsers);
  if (rest.price !== undefined) updateData.price = parseFloat(rest.price);

  const plan = await prisma.subscriptionPlan.update({ where: { id }, data: updateData });

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "UPDATE_PLAN", target: id },
  });

  return NextResponse.json({ success: true, plan });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  // Check if any tenants use this plan
  const count = await prisma.tenant.count({ where: { planId: id } });
  if (count > 0) {
    return NextResponse.json({ error: `No se puede eliminar: ${count} empresa(s) usan este plan` }, { status: 409 });
  }

  await prisma.subscriptionPlan.delete({ where: { id } });

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "DELETE_PLAN", target: id },
  });

  return NextResponse.json({ success: true });
}
