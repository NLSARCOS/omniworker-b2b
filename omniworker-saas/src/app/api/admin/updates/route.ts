// src/app/api/admin/updates/route.ts — Admin software updates CRUD
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const updates = await prisma.appUpdate.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    updates,
  });
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const rateLimit = await checkRateLimit(ip, "admin");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
  }

  interface UpdateCreateBody {
    version: string;
    urlWindows: string;
    urlMac: string;
    urlLinux: string;
    releaseNotes?: string;
    isActive?: boolean;
  }

  let body: UpdateCreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { version, urlWindows, urlMac, urlLinux, releaseNotes, isActive } = body;
  if (!version || !urlWindows || !urlMac || !urlLinux) {
    return NextResponse.json(
      { error: "La versión y los enlaces de descarga son requeridos" },
      { status: 400 }
    );
  }

  // If this update is going to be active, deactivate all previous updates first
  const shouldBeActive = isActive ?? true;
  if (shouldBeActive) {
    await prisma.appUpdate.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }

  const created = await prisma.appUpdate.create({
    data: {
      version,
      urlWindows,
      urlMac,
      urlLinux,
      releaseNotes: releaseNotes || null,
      isActive: shouldBeActive,
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId: auth.user.id,
      action: "CREATE_APP_UPDATE",
      target: created.id,
      details: JSON.stringify({ version, isActive: shouldBeActive }),
    },
  });

  return NextResponse.json({ success: true, id: created.id });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const rateLimit = await checkRateLimit(ip, "admin");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
  }

  interface UpdateUpdateBody {
    id: string;
    version?: string;
    urlWindows?: string;
    urlMac?: string;
    urlLinux?: string;
    releaseNotes?: string;
    isActive?: boolean;
  }

  let body: UpdateUpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { id, version, urlWindows, urlMac, urlLinux, releaseNotes, isActive } = body;
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  // If activating this update, deactivate others
  if (isActive === true) {
    await prisma.appUpdate.updateMany({
      where: { id: { not: id }, isActive: true },
      data: { isActive: false },
    });
  }

  const updateData: Record<string, any> = {};
  if (version !== undefined) updateData.version = version;
  if (urlWindows !== undefined) updateData.urlWindows = urlWindows;
  if (urlMac !== undefined) updateData.urlMac = urlMac;
  if (urlLinux !== undefined) updateData.urlLinux = urlLinux;
  if (releaseNotes !== undefined) updateData.releaseNotes = releaseNotes;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updated = await prisma.appUpdate.update({
    where: { id },
    data: updateData,
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId: auth.user.id,
      action: "UPDATE_APP_UPDATE",
      target: id,
      details: JSON.stringify({ version: updated.version, isActive: updated.isActive }),
    },
  });

  return NextResponse.json({ success: true, id: updated.id });
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const deleted = await prisma.appUpdate.delete({
    where: { id },
  });

  await prisma.adminAuditLog.create({
    data: {
      adminId: auth.user.id,
      action: "DELETE_APP_UPDATE",
      target: id,
      details: JSON.stringify({ version: deleted.version }),
    },
  });

  return NextResponse.json({ success: true });
}
