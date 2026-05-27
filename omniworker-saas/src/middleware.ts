// src/middleware.ts — Edge auth + security headers
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET;

// Routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/admin"];
// Routes that are always public
const PUBLIC_ROUTES = ["/", "/login", "/register", "/terms", "/privacy"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Nonce generation for CSP ───
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // ─── Security Headers for all responses ───
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  const headers = response.headers;

  headers.set("x-nonce", nonce);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  const isProd = process.env.NODE_ENV === "production";
  const scriptCsp = isProd
    ? `'self' 'nonce-${nonce}'`
    : `'self' 'nonce-${nonce}' 'unsafe-eval'`;

  headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src ${scriptCsp}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`
  );
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isProd) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  // ─── CORS for API routes (allowlist-based) ───
  if (pathname.startsWith("/api/")) {
    const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS || "";
    const ALLOWED_ORIGINS = new Set([
      "https://app.omniworker.com",
      "https://flux.simplex.lat",
      ...(allowedOriginsEnv ? allowedOriginsEnv.split(",").map(o => o.trim()).filter(Boolean) : []),
      ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:5173"] : []),
    ]);

    const origin = request.headers.get("origin") || "";
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Credentials", "true");
    }
    // Non-allowed origins get NO CORS headers — browser blocks the request

    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers });
    }
  }

  // ─── Public page routes ───
  if (
    PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/")) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/")
  ) {
    return response;
  }

  // ─── Auth check for protected routes ───
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (!isProtected) {
    return response;
  }

  const token = request.cookies.get("ow_token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify JWT in edge (jose)
  if (!JWT_SECRET) {
    console.error("[Middleware] JWT_SECRET not configured");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { clockTolerance: 60 });

    // Admin route check
    if (pathname.startsWith("/admin")) {
      const role = payload.role as string;
      if (role !== "SUPERADMIN") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    return response;
  } catch {
    // Token invalid or expired
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    // Clear invalid cookies
    redirectResponse.cookies.set("ow_token", "", { maxAge: 0, path: "/" });
    redirectResponse.cookies.set("ow_refresh", "", { maxAge: 0, path: "/" });
    return redirectResponse;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
