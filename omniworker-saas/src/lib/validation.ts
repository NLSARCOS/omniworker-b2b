// src/lib/validation.ts — Zod schemas for all API inputs
import { z } from "zod";

// ─── Auth ───
export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
  deviceFingerprint: z.string().max(256).regex(/^[a-zA-Z0-9._-]*$/, "Caracteres no permitidos").optional(),
  deviceName: z.string().max(128).regex(/^[a-zA-Z0-9._\- ]*$/, "Caracteres no permitidos").optional(),
});

export const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  name: z.string().max(100).optional(),
  tenantName: z.string().max(100).optional(),
});

// ─── Chat / LLM ───
export const chatCompletionSchema = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string()
  }).strict()).min(1, "Se requiere al menos un mensaje"),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
}).strict();

// ─── Edge Agents ───
export const edgeRegisterSchema = z.object({
  agentName: z.string().min(1, "agentName es obligatorio").max(100),
  hostname: z.string().max(100).optional(),
  platform: z.string().max(50).optional(),
  capabilities: z.array(z.string()).optional(),
  licenseId: z.string().optional(),
});

export const edgeHeartbeatSchema = z.object({
  agentId: z.string().min(1, "agentId es obligatorio"),
  status: z.enum(["online", "offline", "busy"]).optional(),
  capabilities: z.array(z.string()).optional(),
  version: z.string().optional(),
});

// ─── Admin ───
export const adminUpdateUserSchema = z.object({
  userId: z.string().min(1),
  tokenBalance: z.number().int().optional(),
  role: z.enum(["USER", "ADMIN", "SUPERADMIN"]).optional(),
  isActive: z.boolean().optional(),
});

export const createPlanSchema = z.object({
  name: z.string().min(1).max(50),
  tokenLimit: z.number().int().positive(),
  maxAgents: z.number().int().positive().default(1),
  maxUsers: z.number().int().positive().default(1),
  price: z.number().nonnegative().default(0),
});

export const adminProviderSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export const adminTenantPatchSchema = z.object({
  tenantId: z.string().min(1),
  planId: z.string().optional(),
  isActive: z.boolean().optional(),
});

// ─── API Keys ───
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  licenseId: z.string().min(1, "licenseId es requerido"),
});

export const deleteApiKeySchema = z.object({
  id: z.string().min(1),
});

// ─── Licenses ───
export const createLicenseSchema = z.object({
  name: z.string().max(100).optional(),
  deviceFingerprint: z.string().max(255).optional(),
});

export const updateLicenseSchema = z.object({
  name: z.string().max(100).optional(),
  deviceFingerprint: z.string().max(255).optional(),
});
