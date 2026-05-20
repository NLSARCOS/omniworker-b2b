import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || "/opt/omniworker-downloads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  // Sanitize filename to prevent directory traversal
  const safeName = path.basename(filename);
  const filePath = path.join(DOWNLOADS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { error: "File not found" },
      { status: 404 },
    );
  }

  const stat = fs.statSync(filePath);
  const stream = fs.createReadStream(filePath);

  // Determine content type
  const ext = path.extname(safeName).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".dmg": "application/x-apple-diskimage",
    ".exe": "application/x-msdownload",
    ".appimage": "application/x-executable",
    ".deb": "application/vnd.debian.binary-package",
    ".rpm": "application/x-rpm",
    ".snap": "application/vnd.snap",
    ".zip": "application/zip",
  };

  const headers = new Headers({
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "Content-Length": stat.size.toString(),
    "Cache-Control": "public, max-age=3600",
  });

  // @ts-expect-error ReadStream is compatible with ReadableStream for NextResponse
  return new NextResponse(stream, { headers });
}
