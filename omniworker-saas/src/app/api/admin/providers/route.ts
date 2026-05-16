// src/app/api/admin/providers/route.ts — CRUD Master Providers (superadmin)
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const providers = await prisma.masterProvider.findMany({
    select: {
      id: true,
      provider: true,
      isActive: true,
      priority: true,
      updatedAt: true,
      apiKey: false, // Never expose full key
    },
    orderBy: { priority: "asc" },
  });

  return NextResponse.json({ providers });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { provider, apiKey, isActive, priority } = body;

  if (!provider || !apiKey) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  const updated = await prisma.masterProvider.upsert({
    where: { provider },
    update: { apiKey, isActive: isActive ?? true, priority: priority ?? 1 },
    create: { provider, apiKey, isActive: isActive ?? true, priority: priority ?? 1 },
  });

  return NextResponse.json({ success: true, provider: updated.provider });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  await prisma.masterProvider.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
