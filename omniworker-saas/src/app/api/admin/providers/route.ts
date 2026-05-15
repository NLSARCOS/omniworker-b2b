import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const providers = await prisma.masterProvider.findMany({
      select: {
        id: true,
        provider: true,
        isActive: true,
        // No devolver la apiKey completa por seguridad, solo un indicador
        apiKey: false
      }
    });

    return NextResponse.json({ providers });
  } catch (error) {
    return NextResponse.json({ error: "Error fetch providers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, apiKey, isActive } = body;

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const updated = await prisma.masterProvider.upsert({
      where: { provider },
      update: { apiKey, isActive: isActive ?? true },
      create: { provider, apiKey, isActive: isActive ?? true }
    });

    return NextResponse.json({ success: true, provider: updated.provider });
  } catch (error) {
    return NextResponse.json({ error: "Error saving provider" }, { status: 500 });
  }
}
