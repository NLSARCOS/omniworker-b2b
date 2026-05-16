// src/app/api/admin/users/route.ts — Manage users (superadmin)
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      tokenBalance: true,
      lastLoginAt: true,
      createdAt: true,
      tenant: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ users });
}

// Update user (balance, role, status)
export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, tokenBalance, role, isActive } = body;

  if (!userId) {
    return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(tokenBalance !== undefined ? { tokenBalance } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

  return NextResponse.json({ success: true, user });
}
