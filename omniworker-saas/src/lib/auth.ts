// src/lib/auth.ts — JWT + bcrypt para OmniWorker SaaS
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "omniworker-dev-secret-change-in-prod";
const JWT_EXPIRES = "7d";

// ─── Types ───
export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  tenantId: string | null;
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
  };
  accessToken?: string;
  error?: string;
}

// ─── Password helpers ───
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT helpers ───
export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// ─── Auth from request ───
export async function authenticateRequest(request: Request): Promise<{
  user: NonNullable<AuthResult["user"]> & { id: string };
  payload: JWTPayload;
} | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { tenant: true },
  });
  if (!dbUser || !dbUser.isActive) return null;

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      tenantId: dbUser.tenantId,
      tenantName: dbUser.tenant?.name ?? null,
      tokenBalance: dbUser.tokenBalance,
      plan: dbUser.tenant?.plan?.name ?? null,
      isLocked: dbUser.tokenBalance <= 0,
    },
    payload,
  };
}

// ─── Full login flow ───
export async function loginWithEmail(email: string, password: string): Promise<AuthResult> {
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
  };

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
      isLocked: user.tokenBalance <= 0,
    },
    accessToken: signToken(payload),
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
      role: tenantId ? "ADMIN" : "USER", // Creator of tenant is ADMIN
      tenantId,
      tokenBalance: 500, // Welcome bonus
    },
    include: { tenant: { include: { plan: true } } },
  });

  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };

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
    },
    accessToken: signToken(payload),
  };
}
