// src/app/api/v1/auth/me/route.ts — Get current user profile
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user: auth.user,
  });
}
