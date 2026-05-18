// src/app/api/admin/tenants/route.ts — Full tenant CRUD with rich profile
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenants = await prisma.tenant.findMany({
    include: {
      plan: { select: { id: true, name: true, tokenLimit: true, price: true } },
      _count: { select: { users: true, edgeAgents: true, tasks: true } },
      users: { select: { tokenBalance: true } },
      apiKeys: { select: { id: true, name: true, keyPrefix: true, lastUsedAt: true } },
      edgeAgents: { select: { id: true, agentName: true, status: true, lastSeenAt: true } }
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tenants });
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

  interface TenantCreateBody {
    name: string;
    planId?: string;
    isActive?: boolean;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    website?: string;
    taxId?: string;
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
    notes?: string;
    adminEmail?: string;
    adminPassword?: string;
    adminName?: string;
    tokenBalance?: number | string;
    subscriptionEndsAt?: string | Date;
  }

  let body: TenantCreateBody;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const {
    name, planId, isActive,
    contactName, contactEmail, contactPhone, website,
    taxId, address, city, country, postalCode,
    notes,
    adminEmail, adminPassword, adminName,
    tokenBalance,
    subscriptionEndsAt
  } = body;

  if (!name) {
    return NextResponse.json({ error: "El nombre de la empresa es requerido" }, { status: 400 });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      planId: planId || null,
      isActive: isActive ?? true,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      website: website || null,
      taxId: taxId || null,
      address: address || null,
      city: city || null,
      country: country || null,
      postalCode: postalCode || null,
      notes: notes || null,
      subscriptionEndsAt: subscriptionEndsAt ? new Date(subscriptionEndsAt) : null,
    },
  });

  // Create admin user for the tenant if email provided
  let adminUser = null;
  if (adminEmail && adminPassword) {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existing) {
      // Rollback tenant creation since we can't create the requested admin user
      await prisma.tenant.delete({ where: { id: tenant.id } });
      return NextResponse.json({ error: `El email ${adminEmail} ya está registrado` }, { status: 400 });
    }
    const pwHash = await hashPassword(adminPassword);
    adminUser = await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash: pwHash,
          name: adminName || contactName || name,
          role: "ADMIN",
          tenantId: tenant.id,
          tokenBalance: tokenBalance !== undefined ? (typeof tokenBalance === 'string' ? parseInt(tokenBalance) : tokenBalance) : 10000,
          isActive: true,
        },
      });
  }

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "CREATE_TENANT", target: tenant.id, details: JSON.stringify({ name, planId }) },
  });

  return NextResponse.json({ success: true, tenant, adminUser: adminUser ? { id: adminUser.id, email: adminUser.email } : null });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  interface TenantUpdateBody {
    id: string;
    name?: string;
    planId?: string;
    isActive?: boolean;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    website?: string;
    taxId?: string;
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
    notes?: string;
    subscriptionEndsAt?: string | Date;
  }

  let body: TenantUpdateBody;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { id, subscriptionEndsAt, ...data } = body;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const updatePayload: Record<string, unknown> = { ...data };
  if (subscriptionEndsAt !== undefined) {
    updatePayload.subscriptionEndsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: updatePayload,
    include: { plan: true },
  });

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "UPDATE_TENANT", target: id },
  });

  return NextResponse.json({ success: true, tenant });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  // Safety: don't delete if it has users
  const userCount = await prisma.user.count({ where: { tenantId: id } });
  if (userCount > 0) {
    return NextResponse.json({ error: `No se puede eliminar: la empresa tiene ${userCount} usuario(s)` }, { status: 409 });
  }

  await prisma.tenant.delete({ where: { id } });

  await prisma.adminAuditLog.create({
    data: { adminId: auth.user.id, action: "DELETE_TENANT", target: id },
  });

  return NextResponse.json({ success: true });
}
