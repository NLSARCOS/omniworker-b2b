// src/app/api/v1/auth/register/route.ts
import { NextResponse } from "next/server";
import { registerUser, setAuthCookies } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // Rate limiting by IP
    const ip = request.headers.get("x-forwarded-for") || "unknown-ip";
    const rateLimit = await checkRateLimit(ip, "auth");
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta más tarde." },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Zod validation
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, password, name, tenantName } = parsed.data;
    const result = await registerUser({ email, password, name, tenantName });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Set cookies
    await setAuthCookies(result.accessToken!, result.refreshToken!);

    return NextResponse.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    console.error("[Register API] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
