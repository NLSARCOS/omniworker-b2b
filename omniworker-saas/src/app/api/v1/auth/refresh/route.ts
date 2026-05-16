// src/app/api/v1/auth/refresh/route.ts — Rotate refresh tokens
import { NextResponse } from "next/server";
import { refreshAccessToken, setAuthCookies } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("ow_refresh")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "No refresh token provided" },
        { status: 401 }
      );
    }

    const result = await refreshAccessToken(refreshToken);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 401 }
      );
    }

    await setAuthCookies(result.accessToken!, result.refreshToken!);

    return NextResponse.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    console.error("[Refresh API] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
