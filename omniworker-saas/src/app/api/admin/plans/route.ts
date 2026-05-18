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

  interface PlanCreateBody {
    name: string;
    description?: string;
    tokenLimit: number | string;
    maxAgents?: number | string;
    maxUsers?: number | string;
    maxLicenses?: number | string;
    price: number | string;
    billingPeriod?: string;
    isPublic?: boolean;
    features?: string[];
    sortOrder?: number | string;
  }
  
  let body: PlanCreateBody;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, description, tokenLimit, maxAgents, maxUsers, maxLicenses, price, billingPeriod, isPublic, features, sortOrder } = body;


  if (!name || tokenLimit === undefined || price === undefined) {
    return NextResponse.json({ error: "name, tokenLimit y price son requeridos" }, { status: 400 });
  }


  const plan = await prisma.subscriptionPlan.create({
    data: {
      name,
      description: description || null,
      tokenLimit: typeof tokenLimit === 'string' ? parseInt(tokenLimit) : tokenLimit,
      maxAgents: typeof maxAgents === 'string' ? parseInt(maxAgents) : (maxAgents ?? 1),
      maxUsers: typeof maxUsers === 'string' ? parseInt(maxUsers) : (maxUsers ?? 1),
      maxLicenses: typeof maxLicenses === 'string' ? parseInt(maxLicenses) : (maxLicenses ?? 1),
      price: typeof price === 'string' ? parseFloat(price) : price,
      billingPeriod: billingPeriod || "monthly",
      isPublic: isPublic ?? true,
      features: JSON.stringify(features || []),
      sortOrder: typeof sortOrder === 'string' ? parseInt(sortOrder) : (sortOrder ?? 0),
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

  interface PlanUpdateBody {
    id: string;
    name?: string;
    description?: string;
    tokenLimit?: number | string;
    maxAgents?: number | string;
    maxUsers?: number | string;
    maxLicenses?: number | string;
    price?: number | string;
    billingPeriod?: string;
    isPublic?: boolean;
    features?: string[];
    sortOrder?: number | string;
  }

  let body: PlanUpdateBody;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { id, features, ...rest } = body;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const updateData: Record<string, unknown> = { ...rest };
  if (features !== undefined) updateData.features = JSON.stringify(features);
  if (rest.tokenLimit !== undefined) updateData.tokenLimit = typeof rest.tokenLimit === 'string' ? parseInt(rest.tokenLimit) : rest.tokenLimit;
  if (rest.maxAgents !== undefined) updateData.maxAgents = typeof rest.maxAgents === 'string' ? parseInt(rest.maxAgents) : rest.maxAgents;
  if (rest.maxUsers !== undefined) updateData.maxUsers = typeof rest.maxUsers === 'string' ? parseInt(rest.maxUsers) : rest.maxUsers;
  if (rest.maxLicenses !== undefined) updateData.maxLicenses = typeof rest.maxLicenses === 'string' ? parseInt(rest.maxLicenses) : rest.maxLicenses;
  if (rest.price !== undefined) updateData.price = typeof rest.price === 'string' ? parseFloat(rest.price) : rest.price;

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
