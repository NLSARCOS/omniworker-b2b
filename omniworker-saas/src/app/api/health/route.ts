// src/app/api/health/route.ts — Health check for Docker and load balancers
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ok",
        db: "connected",
        version: process.env.npm_package_version || "0.1.0",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Health Check] DB connection failed:", error);
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        version: process.env.npm_package_version || "0.1.0",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
