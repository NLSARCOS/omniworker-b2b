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
      users: { select: { tokenBalance: true } }
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

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const {
    name, planId, isActive,
    // Contact
    contactName, contactEmail, contactPhone, website,
    // Fiscal
    taxId, address, city, country, postalCode,
    // Notes
    notes,
    // Admin user for this tenant
    adminEmail, adminPassword, adminName,
    // Tokens
    tokenBalance,
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
    },
  });

  // Create admin user for the tenant if email provided
  let adminUser = null;
  if (adminEmail && adminPassword) {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      const pwHash = await hashPassword(adminPassword);
      adminUser = await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash: pwHash,
          name: adminName || contactName || name,
          role: "ADMIN",
          tenantId: tenant.id,
          tokenBalance: tokenBalance || 10000,
          isActive: true,
        },
      });
    }
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

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const tenant = await prisma.tenant.update({
    where: { id },
    data,
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
