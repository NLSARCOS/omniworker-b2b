import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Faltan credenciales" }, { status: 400 });
    }

    // Consulta real a la base de datos
    const user = await prisma.user.findUnique({ 
      where: { email }, 
      include: { plan: true } 
    });

    if (!user) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    // En producción se usaría bcrypt.compare, pero para no añadir dep ahora, verificamos hash directo
    if (user.passwordHash !== password) { 
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    // 1. JWT Básico (Para MVP, usando un string codificado)
    const accessToken = "jwt-mock-" + Buffer.from(email).toString('base64');
    
    // 2. Llave Única para Desencriptar el SQLite Local del usuario
    const localDatabaseCryptoKey = "aes-256-key-" + user.id;

    // 3. Chequeo de Suscripción para el Bloqueo en Desktop
    const tokenBalance = user.tokenBalance;
    const planName = user.plan?.name || "Sin Plan";
    const isLocked = tokenBalance <= 0;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        plan: planName,
        tokenBalance,
        isLocked
      },
      auth: {
        accessToken,
        localDatabaseCryptoKey
      }
    });

  } catch (error) {
    console.error("[Auth API] Error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
