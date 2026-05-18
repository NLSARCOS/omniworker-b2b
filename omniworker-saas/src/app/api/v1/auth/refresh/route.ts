// src/app/api/v1/auth/refresh/route.ts — Rotate refresh tokens
import { NextResponse } from "next/server";
import { refreshAccessToken, setAuthCookies } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    // Accept refresh token from body (desktop clients) OR cookie (web clients)
    let refreshToken: string | undefined;

    // Try body first (for Electron / desktop clients that can't use HTTP-only cookies)
    try {
      const body = await request.json();
      refreshToken = body.refreshToken;
    } catch {
      // no body — fall through to cookie
    }

    // Fall back to cookie (for web browser sessions)
    if (!refreshToken) {
      const cookieStore = await cookies();
      refreshToken = cookieStore.get("ow_refresh")?.value;
    }

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

    // Set cookies for web clients
    await setAuthCookies(result.accessToken!, result.refreshToken!);

    // Also return tokens in body for desktop clients
    return NextResponse.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
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
