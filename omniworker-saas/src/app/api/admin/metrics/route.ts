import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Aggregate API/Model usage
  const modelUsage = await prisma.taskLog.groupBy({
    by: ['modelUsed'],
    _sum: {
      promptTokens: true,
      completionTks: true,
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: 'desc'
      }
    },
    take: 10,
  });

  const formattedModelUsage = modelUsage.map(m => ({
    model: m.modelUsed,
    calls: m._count.id,
    tokens: (m._sum.promptTokens || 0) + (m._sum.completionTks || 0)
  }));

  return NextResponse.json({
    models: formattedModelUsage,
  });
}
