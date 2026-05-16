// src/app/api/admin/plans/route.ts — CRUD Subscription Plans (superadmin)
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const plans = await prisma.subscriptionPlan.findMany({
    include: { _count: { select: { tenants: true } } },
    orderBy: { price: "asc" },
  });

  return NextResponse.json({ plans });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const { name, tokenLimit, maxAgents, maxUsers, price } = body;

  if (!name || tokenLimit === undefined) {
    return NextResponse.json({ error: "name y tokenLimit son obligatorios" }, { status: 400 });
  }

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name,
      tokenLimit,
      maxAgents: maxAgents ?? 1,
      maxUsers: maxUsers ?? 1,
      price: price ?? 0,
    },
  });

  return NextResponse.json({ success: true, plan });
}
