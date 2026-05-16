// src/app/api/v1/auth/logout/route.ts — Clear auth cookies and revoke refresh token
import { NextResponse } from "next/server";
import { logoutUser } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("ow_refresh")?.value;
    await logoutUser(refreshToken);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Logout API] Error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
