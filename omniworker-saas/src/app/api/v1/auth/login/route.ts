// src/app/api/v1/auth/login/route.ts — Login con bcrypt + JWT real
import { NextResponse } from "next/server";
import { loginWithEmail } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Faltan credenciales" },
        { status: 400 }
      );
    }

    const result = await loginWithEmail(email, password);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      user: result.user,
      auth: {
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    console.error("[Auth API] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
