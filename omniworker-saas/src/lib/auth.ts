// src/lib/auth.ts — JWT + bcrypt + cookie-aware auth + refresh tokens
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { randomBytes, createHash } from "crypto";

// ─── Env validation ───
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is required");
}
if (!JWT_REFRESH_SECRET) {
  throw new Error("FATAL: JWT_REFRESH_SECRET environment variable is required");
}

const ACCESS_TOKEN_EXPIRES = "15m";
const REFRESH_TOKEN_EXPIRES = "7d";
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds
const ACCESS_TOKEN_MAX_AGE = 60 * 15; // 15 minutes in seconds

// ─── Types ───
export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  tenantId: string | null;
  deviceFingerprint?: string;
}

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    tenantId: string | null;
    tenantName: string | null;
    tokenBalance: number;
    plan: string | null;
    isLocked: boolean;
    isPlanExpired?: boolean;
    subscriptionEndsAt?: string | null;
  };
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

// ─── Password helpers ───
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Token helpers ───
export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

export function signRefreshToken(payload: { userId: string; family: string }): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET!, { expiresIn: REFRESH_TOKEN_EXPIRES });
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as JWTPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string; family: string } | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET!) as { userId: string; family: string };
  } catch {
    return null;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateTokenFamily(): string {
  return randomBytes(16).toString("hex");
}

// ─── Cookie helpers ───
function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge,
    path: "/",
  };
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies();
  cookieStore.set("ow_token", accessToken, getCookieOptions(ACCESS_TOKEN_MAX_AGE));
  cookieStore.set("ow_refresh", refreshToken, getCookieOptions(REFRESH_TOKEN_MAX_AGE));
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.set("ow_token", "", { ...getCookieOptions(0), maxAge: 0 });
  cookieStore.set("ow_refresh", "", { ...getCookieOptions(0), maxAge: 0 });
}

// ─── Refresh token DB operations ───
export async function createRefreshToken(userId: string, existingFamily?: string): Promise<string> {
  const family = existingFamily || generateTokenFamily();
  const token = signRefreshToken({ userId, family });
  const tokenHash = hashToken(token);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      family,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000),
    },
  });

  return token;
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revoked: true },
  });
}

export async function revokeTokenFamily(family: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { family },
    data: { revoked: true },
  });
}

export async function validateRefreshToken(token: string): Promise<{ userId: string; family: string } | null> {
  const payload = verifyRefreshToken(token);
  if (!payload) return null;

  const tokenHash = hashToken(token);
  const dbToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!dbToken) return null;

  // THEFT DETECTION: if a revoked token is presented, the entire family is compromised
  if (dbToken.revoked) {
    console.error(`[Auth] SECURITY: Revoked refresh token reused. Revoking entire family: ${dbToken.family}`);
    await revokeTokenFamily(dbToken.family);
    return null;
  }

  if (dbToken.expiresAt < new Date()) {
    return null;
  }

  return { userId: dbToken.userId, family: dbToken.family };
}

// ─── Auth from request ───
export async function authenticateRequest(request: Request): Promise<{
  user: NonNullable<AuthResult["user"]> & { id: string; licenseId?: string | null };
  payload: JWTPayload;
} | null> {
  // 1. Try cookie first
  const cookieStore = await cookies();
  let token = cookieStore.get("ow_token")?.value;

  // 2. Fallback to Authorization header (for API keys / desktop clients)
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token) return null;

  if (token.startsWith("tsto_")) {
    const keyHash = createHash("sha256").update(token).digest("hex");
    const apiKey = await prisma.tenantApiKey.findUnique({
      where: { keyHash },
      include: {
        license: true,
        tenant: {
          include: {
            plan: true,
            users: { where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, take: 1 }
          }
        }
      },
    });


    // 1. Key must exist
    if (!apiKey) return null;


    // 2. Tenant must be active
    if (!apiKey.tenant.isActive) return null;


    // 3b. Tenant plan subscription must not be expired
    if (apiKey.tenant.subscriptionEndsAt && apiKey.tenant.subscriptionEndsAt < new Date()) {
      return null;
    }

    // 4. Key must have an active license attached
    if (!apiKey.licenseId || !apiKey.license) return null;
    if (apiKey.license.status !== "ACTIVE") return null;


    // 5. Tenant must not exceed maxLicenses
    const activeLicenseCount = await prisma.license.count({
      where: { tenantId: apiKey.tenantId, status: "ACTIVE" },
    });
    const maxLicenses = apiKey.tenant.plan?.maxLicenses ?? 1;
    if (activeLicenseCount > maxLicenses) return null;

    const dbUser = apiKey.tenant.users[0];
    if (!dbUser) return null;

    // Update lastUsedAt on the key AND lastSeenAt on the license
    const now = new Date();
    await Promise.all([
      prisma.tenantApiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: now } }),
      apiKey.licenseId
        ? prisma.license.update({ where: { id: apiKey.licenseId }, data: { lastSeenAt: now } })
        : Promise.resolve(),
    ]);

    const finalTokenBalance = apiKey.license ? apiKey.license.tokenBalance : dbUser.tokenBalance;

    return {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        tenantId: apiKey.tenantId,
        tenantName: apiKey.tenant.name,
        tokenBalance: finalTokenBalance,
        plan: apiKey.tenant.plan?.name ?? null,
        isLocked: finalTokenBalance <= 0,
        isPlanExpired: false, // Edge API Key requests are blocked upstream if expired, so this is false
        licenseId: apiKey.licenseId,
      },
      payload: {
        userId: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        tenantId: apiKey.tenantId,
      },
    };
  }

  const payload = verifyAccessToken(token);
  if (!payload) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { tenant: { include: { plan: true } } },
  });
  if (!dbUser || !dbUser.isActive) return null;

  let activeLicense: any = null;

  // SI EL PAYLOAD CONTIENE HUELLA DE DISPOSITIVO, VALIDAR QUE SIGA ACTIVA
  if (payload.deviceFingerprint && dbUser.tenantId) {
    const license = await prisma.license.findFirst({
      where: {
        tenantId: dbUser.tenantId,
        deviceFingerprint: payload.deviceFingerprint,
        status: "ACTIVE",
      },
    });
    if (!license) return null;
    activeLicense = license;

    // Actualizar lastSeenAt silenciosamente
    prisma.license.update({
      where: { id: license.id },
      data: { lastSeenAt: new Date() },
    }).catch(() => {});
  }

  const isPlanExpired = Boolean(
    dbUser.tenant?.subscriptionEndsAt && dbUser.tenant.subscriptionEndsAt < new Date()
  );

  const finalTokenBalance = activeLicense ? activeLicense.tokenBalance : dbUser.tokenBalance;

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      tenantId: dbUser.tenantId,
      tenantName: dbUser.tenant?.name ?? null,
      tokenBalance: finalTokenBalance,
      plan: dbUser.tenant?.plan?.name ?? null,
      isLocked: finalTokenBalance <= 0 || isPlanExpired,
      isPlanExpired,
      subscriptionEndsAt: dbUser.tenant?.subscriptionEndsAt?.toISOString() ?? null,
      licenseId: activeLicense ? activeLicense.id : null,
    },
    payload,
  };
}

// ─── Full login flow ───
export async function loginWithEmail(
  email: string,
  password: string,
  deviceFingerprint?: string,
  deviceName?: string,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: { include: { plan: true } } },
  });

  if (!user || !user.isActive) {
    return { success: false, error: "Credenciales inválidas" };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { success: false, error: "Credenciales inválidas" };
  }

  // VALIDAR DISPOSITIVO B2B (LICENCIAS) SI SE PROVEE UN FINGERPRINT
  if (deviceFingerprint && user.tenantId && user.tenant) {
    const existingLicense = await prisma.license.findFirst({
      where: {
        tenantId: user.tenantId,
        deviceFingerprint: deviceFingerprint,
      },
    });

    if (existingLicense) {
      if (existingLicense.status === "REVOKED") {
        return {
          success: false,
          error: "Este dispositivo ha sido revocado. Contacta al administrador para reactivarlo.",
        };
      }
      // Actualizar lastSeenAt y opcionalmente el nombre si cambió
      await prisma.license.update({
        where: { id: existingLicense.id },
        data: {
          lastSeenAt: new Date(),
          ...(deviceName && deviceName !== existingLicense.name ? { name: deviceName } : {}),
        },
      });
    } else {
      // Dispositivo nuevo: validar cupos
      const activeCount = await prisma.license.count({
        where: {
          tenantId: user.tenantId,
          status: "ACTIVE",
        },
      });

      const maxLicenses = user.tenant.plan?.maxLicenses ?? 1;
      if (activeCount >= maxLicenses) {
        return {
          success: false,
          error: `Límite de dispositivos alcanzado (Máx: ${maxLicenses}). Libera espacio en tu panel de SaaS.`,
        };
      }

      // Crear la nueva licencia
      await prisma.license.create({
        data: {
          tenantId: user.tenantId,
          name: deviceName || `Dispositivo ${activeCount + 1}`,
          deviceFingerprint: deviceFingerprint,
          status: "ACTIVE",
          tokenBalance: user.tenant.plan?.tokenLimit ?? 1000000,
        },
      });
    }
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    ...(deviceFingerprint ? { deviceFingerprint } : {}),
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = await createRefreshToken(user.id);

  const isPlanExpired = Boolean(
    user.tenant?.subscriptionEndsAt && user.tenant.subscriptionEndsAt < new Date()
  );

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
      tokenBalance: user.tokenBalance,
      plan: user.tenant?.plan?.name ?? null,
      isLocked: user.tokenBalance <= 0 || isPlanExpired,
      isPlanExpired,
      subscriptionEndsAt: user.tenant?.subscriptionEndsAt?.toISOString() ?? null,
    },
    accessToken,
    refreshToken,
  };
}

// ─── Registration ───
export async function registerUser(params: {
  email: string;
  password: string;
  name?: string;
  tenantName?: string;
}): Promise<AuthResult> {
  const { email, password, name, tenantName } = params;

  // Check if email exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "Este email ya está registrado" };
  }

  const passwordHash = await hashPassword(password);

  // Create tenant if name provided (otherwise user is standalone)
  let tenantId: string | null = null;
  if (tenantName) {
    const slug = tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
    if (existingSlug) {
      return { success: false, error: "El nombre de la empresa ya está en uso" };
    }

    // Get or create Free plan
    let plan = await prisma.subscriptionPlan.findFirst({ where: { name: "Free" } });
    if (!plan) {
      plan = await prisma.subscriptionPlan.create({
        data: { name: "Free", tokenLimit: 10000, maxAgents: 1, maxUsers: 3, price: 0 },
      });
    }

    const tenant = await prisma.tenant.create({
      data: { name: tenantName, slug, planId: plan.id },
    });
    tenantId = tenant.id;
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || email.split("@")[0],
      role: tenantId ? "ADMIN" : "USER",
      tenantId,
      tokenBalance: 500,
    },
    include: { tenant: { include: { plan: true } } },
  });

  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = await createRefreshToken(user.id);

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
      tokenBalance: user.tokenBalance,
      plan: user.tenant?.plan?.name ?? null,
      isLocked: false,
      isPlanExpired: false,
      subscriptionEndsAt: user.tenant?.subscriptionEndsAt?.toISOString() ?? null,
    },
    accessToken,
    refreshToken,
  };
}

// ─── Refresh flow ───
export async function refreshAccessToken(refreshToken: string, deviceFingerprint?: string): Promise<AuthResult> {
  const validated = await validateRefreshToken(refreshToken);
  if (!validated) {
    return { success: false, error: "Token de refresco inválido o expirado" };
  }

  // Token rotation: revoke old token first, then create new one.
  // Order matters: if revocation fails, no new token is created and the old one stays valid.
  // If new token creation fails after revocation, the user must re-login (acceptable for a DB failure).
  // createRefreshToken uses the module-level prisma client and cannot be placed inside a transaction,
  // so revocation is done in its own transaction before issuance.
  const oldHash = hashToken(refreshToken);
  let newRefreshToken: string;
  try {
    // Step 1: Revoke the old token atomically
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { tokenHash: oldHash },
        data: { revoked: true },
      });
    });
    // Step 2: Only create new token after revocation succeeds
    newRefreshToken = await createRefreshToken(validated.userId, validated.family);
  } catch (error) {
    console.error("[Auth] Refresh rotation failed:", error);
    return { success: false, error: "Error en la rotación de token" };
  }

  const user = await prisma.user.findUnique({
    where: { id: validated.userId },
    include: { tenant: { include: { plan: true } } },
  });

  if (!user || !user.isActive) {
    return { success: false, error: "Usuario no encontrado o inactivo" };
  }

  // SI SE PROVEE HUELLA, VALIDAR QUE LA LICENCIA SIGA ACTIVA
  if (deviceFingerprint && user.tenantId) {
    const license = await prisma.license.findFirst({
      where: {
        tenantId: user.tenantId,
        deviceFingerprint: deviceFingerprint,
        status: "ACTIVE",
      },
    });
    if (!license) {
      return { success: false, error: "Dispositivo revocado o inactivo" };
    }
  }

  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    ...(deviceFingerprint ? { deviceFingerprint } : {}),
  };

  const accessToken = signAccessToken(payload);

  const isPlanExpired = Boolean(
    user.tenant?.subscriptionEndsAt && user.tenant.subscriptionEndsAt < new Date()
  );

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
      tokenBalance: user.tokenBalance,
      plan: user.tenant?.plan?.name ?? null,
      isLocked: user.tokenBalance <= 0 || isPlanExpired,
      isPlanExpired,
      subscriptionEndsAt: user.tenant?.subscriptionEndsAt?.toISOString() ?? null,
    },
    accessToken,
    refreshToken: newRefreshToken,
  };
}

// ─── Logout ───
export async function logoutUser(refreshToken?: string): Promise<void> {
  if (refreshToken) {
    const hash = hashToken(refreshToken);
    await revokeRefreshToken(hash);
  }
  await clearAuthCookies();
}
