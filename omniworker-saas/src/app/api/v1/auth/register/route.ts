// src/app/api/v1/auth/register/route.ts
import { NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, tenantName } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son obligatorios" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400 }
      );
    }

    const result = await registerUser({ email, password, name, tenantName });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error) {
    console.error("[Register API] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
