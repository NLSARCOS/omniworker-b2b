// src/app/api/admin/invoices/route.ts — Admin invoicing endpoints
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");

  const whereClause = tenantId ? { tenantId } : {};

  try {
    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: {
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const formattedInvoices = invoices.map(inv => ({
      ...inv,
      amount: inv.amount / 100,
    }));
    return NextResponse.json({ invoices: formattedInvoices });
  } catch (err: any) {
    return NextResponse.json({ error: "Error al consultar facturas: " + err.message }, { status: 500 });
  }
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

  interface PaymentRecordBody {
    tenantId: string;
    amount: number;
    description?: string;
    subscriptionEndsAt: string | Date;
  }

  let body: PaymentRecordBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { tenantId, amount, description, subscriptionEndsAt } = body;

  if (!tenantId || amount === undefined || !subscriptionEndsAt) {
    return NextResponse.json({ error: "tenantId, amount y subscriptionEndsAt son requeridos" }, { status: 400 });
  }

  try {
    // 1. Verify tenant exists
    const tenantExists = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenantExists) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    // 2. Generate a sequential invoice number
    const count = await prisma.invoice.count();
    const nextNum = (count + 1).toString().padStart(4, "0");
    const currentYear = new Date().getFullYear();
    const invoiceNumber = `INV-${currentYear}-${nextNum}`;

    // Get plan token limit for auto-replenishment of licenses
    const tenantPlan = tenantExists.planId
      ? await prisma.subscriptionPlan.findUnique({ where: { id: tenantExists.planId } })
      : null;
    const planTokenLimit = tenantPlan?.tokenLimit ?? 1000000;

    // 3. Create invoice, update tenant, and replenish active B2B licenses in a transaction
    const [invoice, updatedTenant] = await prisma.$transaction([
      prisma.invoice.create({
        data: {
          tenantId,
          amount: Math.round(parseFloat(amount as any) * 100),
          description: description || "Pago de suscripción manual",
          invoiceNumber,
          status: "PAID",
          paymentMethod: "MANUAL",
        },
      }),
      prisma.tenant.update({
        where: { id: tenantId },
        data: {
          subscriptionEndsAt: new Date(subscriptionEndsAt),
        },
      }),
      prisma.license.updateMany({
        where: { tenantId, status: "ACTIVE" },
        data: { tokenBalance: planTokenLimit },
      }),
    ]);

    // 4. Log audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: auth.user.id,
        action: "RECORD_PAYMENT",
        target: tenantId,
        details: JSON.stringify({ amount, invoiceNumber, subscriptionEndsAt }),
      },
    });

    return NextResponse.json({ success: true, invoice: { ...invoice, amount: invoice.amount / 100 }, tenant: updatedTenant });
  } catch (err: any) {
    return NextResponse.json({ error: "Error al registrar el pago: " + err.message }, { status: 500 });
  }
}
