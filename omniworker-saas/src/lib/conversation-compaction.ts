// src/lib/conversation-compaction.ts — Conversation compaction for long contexts
// Brutalist backend: minimal, functional, zero deps.

import { fetchWithBackoff } from "./fetch-backoff";

export interface Message {
  role: string;
  content: string;
}

export interface CompactionConfig {
  provider: string;
  apiKey: string;
  model: string;
  endpoint?: "chat_completions" | "messages";
}

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/chat/completions",
  moonshot: "https://api.kimi.com/coding/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
  "z-ai": "https://api.z.ai/api/coding/paas/v4/chat/completions",
};

const OPENCODE_GO_ENDPOINTS = {
  chat_completions: "https://opencode.ai/zen/go/v1/chat/completions",
  messages: "https://opencode.ai/zen/go/v1/messages",
} as const;

const CACHE_TTL_MS = 5 * 60 * 1000;

const summaryCache = new Map<string, { summary: string; expiresAt: number }>();

function djb2Hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
  }
  return String(h >>> 0);
}

function getCacheKey(messages: Message[]): string {
  const raw = messages.map(m => `${m.role}:${m.content.length}:${m.content.slice(0, 200)}`).join("¦");
  return djb2Hash(raw);
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of summaryCache.entries()) {
    if (entry.expiresAt < now) summaryCache.delete(key);
  }
}

async function generateSummary(
  middle: Message[],
  userQuery: string,
  config: CompactionConfig
): Promise<string> {
  const prompt = `Resume la siguiente conversación de forma concisa, manteniendo los puntos clave, decisiones y contexto necesario para continuar. La pregunta actual del usuario es: "${userQuery}".

Conversación:
${middle.map(m => `[${m.role}]: ${m.content}`).join("\n\n")}

Resumen (máximo 3-4 párrafos):`;

  let url = PROVIDER_URLS[config.provider] || PROVIDER_URLS.openai;
  if (config.provider === "opencode-go" && config.endpoint) {
    url = OPENCODE_GO_ENDPOINTS[config.endpoint];
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let payload: Record<string, unknown>;

  const useAnthropicFormat =
    config.provider === "anthropic" ||
    (config.provider === "opencode-go" && config.endpoint === "messages");

  if (useAnthropicFormat) {
    if (config.provider === "anthropic") {
      headers["x-api-key"] = config.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
      headers["x-api-key"] = config.apiKey;
    }
    payload = {
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    };
  } else {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
    payload = {
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    };
  }

  try {
    const res = await fetchWithBackoff(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Compaction] Summary generation failed:", err.slice(0, 300));
      return fallbackSummary(middle);
    }

    const data = (await res.json()) as Record<string, unknown>;

    const choice = (data.choices as any)?.[0]?.message?.content;
    if (choice) return String(choice);

    const anthropicText = (data.content as any)?.[0]?.text;
    if (anthropicText) return String(anthropicText);

    const rawContent = data.content;
    if (rawContent) return String(rawContent);

    return fallbackSummary(middle);
  } catch (err) {
    console.error("[Compaction] Summary fetch error:", err);
    return fallbackSummary(middle);
  }
}

function fallbackSummary(middle: Message[]): string {
  return middle.map(m => `[${m.role}]: ${m.content.substring(0, 300)}...`).join("\n");
}

/**
 * Compacts a long message history by summarizing the middle section.
 * - <= 30 messages: returned unchanged
 * - > 30 messages: first 5 + summary of middle + last 20
 * Summaries are cached in-memory with a 5-minute TTL.
 */
export async function compactMessages(
  messages: Message[],
  userQuery: string,
  config: CompactionConfig
): Promise<Message[]> {
  if (messages.length <= 30) return messages;

  const first = messages.slice(0, 5);
  const tail = messages.slice(-20);
  const middle = messages.slice(5, -20);

  evictExpired();

  const key = getCacheKey(middle);
  const cached = summaryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return [
      ...first,
      { role: "system", content: "## Resumen de conversación anterior:\n" + cached.summary },
      ...tail,
    ];
  }

  const summary = await generateSummary(middle, userQuery, config);

  summaryCache.set(key, { summary, expiresAt: Date.now() + CACHE_TTL_MS });

  return [
    ...first,
    { role: "system", content: "## Resumen de conversación anterior:\n" + summary },
    ...tail,
  ];
}
