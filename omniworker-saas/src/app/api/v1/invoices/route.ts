// src/app/api/v1/invoices/route.ts — User invoicing history endpoint
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantId = auth.user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ success: true, invoices: [] });
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { paidAt: "desc" },
    });
    return NextResponse.json({ success: true, invoices });
  } catch (err: any) {
    return NextResponse.json({ error: "Error al obtener facturas: " + err.message }, { status: 500 });
  }
}
