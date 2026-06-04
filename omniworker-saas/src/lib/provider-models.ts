// src/lib/provider-models.ts — Centralized model catalog per provider

export interface ModelInfo {
  id: string;
  label: string;
  endpoint?: "chat_completions" | "messages"; // default: chat_completions
  weight?: number; // for routing priority
  tier?: "reasoning" | "balanced" | "speed";
}

// OpenCode Go full catalog (from existing OPENCODE_GO_CATALOG in chat/completions/route.ts)
// Note: some models appear in multiple tiers (e.g. glm-5 in balanced+speed)
// We deduplicate by id when exporting.
const OPENCODE_GO_ALL: ModelInfo[] = [
  { id: "glm-5.1", label: "GLM-5.1", tier: "reasoning", weight: 3, endpoint: "chat_completions" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", tier: "reasoning", weight: 3, endpoint: "chat_completions" },
  { id: "kimi-k2.6", label: "Kimi K2.6", tier: "reasoning", weight: 2, endpoint: "chat_completions" },
  { id: "mimo-v2.5-pro", label: "MiMo-V2.5-Pro", tier: "reasoning", weight: 2, endpoint: "chat_completions" },
  { id: "qwen3.7-max", label: "Qwen3.7 Max", tier: "reasoning", weight: 2, endpoint: "messages" },
  { id: "qwen3.6-plus", label: "Qwen3.6 Plus", tier: "reasoning", weight: 2, endpoint: "messages" },
  { id: "minimax-m2.7", label: "MiniMax M2.7", tier: "reasoning", weight: 1, endpoint: "messages" },
  { id: "glm-5", label: "GLM-5", tier: "balanced", weight: 3, endpoint: "chat_completions" },
  { id: "kimi-k2.5", label: "Kimi K2.5", tier: "balanced", weight: 3, endpoint: "chat_completions" },
  { id: "mimo-v2.5", label: "MiMo-V2.5", tier: "balanced", weight: 2, endpoint: "chat_completions" },
  { id: "qwen3.5-plus", label: "Qwen3.5 Plus", tier: "balanced", weight: 2, endpoint: "chat_completions" },
  { id: "minimax-m2.5", label: "MiniMax M2.5", tier: "balanced", weight: 1, endpoint: "messages" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "speed", weight: 4, endpoint: "chat_completions" },
];

export const PROVIDER_MODELS: Record<string, ModelInfo[]> = {
  "opencode-go": OPENCODE_GO_ALL,
  deepseek: [
    { id: "deepseek-chat", label: "DeepSeek Chat", endpoint: "chat_completions" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner", endpoint: "chat_completions" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "o3", label: "O3" },
    { id: "o3-mini", label: "O3 Mini" },
    { id: "o4-mini", label: "O4 Mini" },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
    { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    { id: "gemini-2.0-pro", label: "Gemini 2.0 Pro" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { id: "gemma2-9b-it", label: "Gemma 2 9B" },
  ],
  mistral: [
    { id: "mistral-small-latest", label: "Mistral Small" },
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "codestral-latest", label: "Codestral" },
  ],
  together: [
    { id: "meta-llama/Llama-3-8b-chat-hf", label: "Llama 3 8B" },
    { id: "meta-llama/Llama-3-70b-instruct", label: "Llama 3 70B" },
  ],
  nvidia: [
    { id: "stepfun-ai/step-3.7-flash", label: "Step 3.7 Flash" },
    { id: "qwen/qwen2.5-72b-instruct", label: "Qwen 2.5 72B" },
  ],
  ollama: [
    { id: "llama3", label: "Llama 3" },
    { id: "llama3.1", label: "Llama 3.1" },
    { id: "codellama", label: "Code Llama" },
  ],
  moonshot: [
    { id: "k2.6", label: "Kimi K2.6" },
    { id: "k2.5", label: "Kimi K2.5" },
    { id: "moonshot-v1-8k", label: "Moonshot V1 8K" },
  ],
  "z-ai": [
    { id: "glm-5", label: "GLM-5" },
    { id: "glm-5.1", label: "GLM-5.1" },
  ],
  stepfun: [
    { id: "step-3.7-flash", label: "Step 3.7 Flash" },
    { id: "step-3.5-flash", label: "Step 3.5 Flash" },
    { id: "step-2-16k", label: "Step 2 16K" },
  ],
  "kimi-code": [
    { id: "k2.6", label: "Kimi K2.6" },
    { id: "k2.5", label: "Kimi K2.5" },
  ],
  cohere: [
    { id: "command-r", label: "Command R" },
    { id: "command-r-plus", label: "Command R+" },
  ],
};

/**
 * Get all models for a provider, deduplicated by model ID.
 */
export function getModelsForProvider(provider: string): ModelInfo[] {
  const models = PROVIDER_MODELS[provider] || [];
  const seen = new Set<string>();
  const deduped: ModelInfo[] = [];
  for (const model of models) {
    if (!seen.has(model.id)) {
      seen.add(model.id);
      deduped.push(model);
    }
  }
  return deduped;
}

/**
 * Get all unique model IDs for a provider.
 */
export function getAllModelIds(provider: string): string[] {
  return getModelsForProvider(provider).map((m) => m.id);
}

/**
 * Get all providers that have a model catalog defined.
 */
export function getCatalogProviders(): string[] {
  return Object.keys(PROVIDER_MODELS);
}
