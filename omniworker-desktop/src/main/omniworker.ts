import { ChildProcess, spawn } from "child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
  copyFileSync,
  chmodSync,
  symlinkSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import http from "http";
import https from "https";
import {
  OMNIWORKER_HOME,
  OMNIWORKER_REPO,
  OMNIWORKER_PYTHON,
  omniworkerCliArgs,
  getEnhancedPath,
  SAAS_BASE_URL,
} from "./installer";
import { getModelConfig, readEnv, getConnectionConfig, setEnvValue, getConfigValue, getSecureTokens } from "./config";
import { ensureMemoryConfig } from "./memory";
import {
  getSshTunnelUrl,
  isSshTunnelActive,
  isSshTunnelHealthy,
  startSshTunnel,
} from "./ssh-tunnel";
import { stripAnsi, profilePaths } from "./utils";
import { readModels } from "./models";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";
import { PowerManager } from "./power";
const pidsFile = join(OMNIWORKER_HOME, "pids.json");

function getRecordedPids(): number[] {
  if (!existsSync(pidsFile)) return [];
  try {
    const raw = readFileSync(pidsFile, "utf-8").trim();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recordPid(pid: number): void {
  try {
    const pids = getRecordedPids();
    if (!pids.includes(pid)) {
      pids.push(pid);
      writeFileSync(pidsFile, JSON.stringify(pids), "utf-8");
    }
  } catch (err) {
    console.error("[PIDS] Failed to record PID:", err);
  }
}

function unrecordPid(pid: number): void {
  try {
    const pids = getRecordedPids();
    const index = pids.indexOf(pid);
    if (index !== -1) {
      pids.splice(index, 1);
      writeFileSync(pidsFile, JSON.stringify(pids), "utf-8");
    }
  } catch (err) {
    console.error("[PIDS] Failed to unrecord PID:", err);
  }
}

export async function checkAndCleanupOrphans(): Promise<void> {
  const pids = getRecordedPids();
  if (pids.length === 0) return;

  console.log(`[PIDS] Found ${pids.length} potentially orphan processes from previous session. Cleaning up...`);
  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      console.log(`[PIDS] Killing orphan process PID ${pid}`);
      process.kill(pid, "SIGKILL");
    } catch {
      // Already dead
    }
  }

  try {
    writeFileSync(pidsFile, JSON.stringify([]), "utf-8");
  } catch (err) {
    console.error("[PIDS] Failed to clear PIDS file:", err);
  }
}

export async function killSpawnedProcessesGracefully(): Promise<void> {
  const pids = getRecordedPids();
  if (pids.length === 0) return;

  console.log(`[PIDS] Gracefully stopping ${pids.length} spawned processes...`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already dead
    }
  }

  const startTime = Date.now();
  while (Date.now() - startTime < 5000) {
    const runningPids = pids.filter((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (runningPids.length === 0) {
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      console.log(`[PIDS] Graceful stop failed for PID ${pid}. Sending SIGKILL.`);
      process.kill(pid, "SIGKILL");
    } catch {
      // dead
    }
  }

  try {
    writeFileSync(pidsFile, JSON.stringify([]), "utf-8");
  } catch (err) {
    console.error("[PIDS] Failed to clear PIDS file:", err);
  }
}

let isPlanExpired = false;

export function setPlanExpired(expired: boolean): void {
  isPlanExpired = expired;
  console.log(`[PlanEnforcement] Subscription plan expiration status updated to: ${isPlanExpired}`);
}

export function getPlanExpired(): boolean {
  return isPlanExpired;
}

const LOCAL_API_URL = "http://127.0.0.1:8642";

export function getApiUrl(): string {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") {
    const sshUrl = getSshTunnelUrl();
    if (!sshUrl) throw new Error("SSH tunnel is not active");
    return sshUrl;
  }
  if (conn.mode === "remote" && conn.remoteUrl) {
    return conn.remoteUrl.replace(/\/+$/, "");
  }
  // Local mode: use the local OmniWorker gateway (port 8642).
  // The gateway runs the full agent with tools (file system, terminal, etc.)
  // and uses the SaaS for LLM inference via the model config's base_url.
  return LOCAL_API_URL;
}

export function isRemoteMode(): boolean {
  const mode = getConnectionConfig().mode;
  return mode === "remote" || mode === "ssh";
}

/** True only for pure remote HTTP — SSH tunnel has full local access via SSH exec */
export function isRemoteOnlyMode(): boolean {
  return getConnectionConfig().mode === "remote";
}

// Cached API key read from the remote .env when SSH tunnel starts
let _sshRemoteApiKey = "";

export function setSshRemoteApiKey(key: string): void {
  _sshRemoteApiKey = key;
}

export function getRemoteAuthHeader(profile?: string): Record<string, string> {
  const conn = getConnectionConfig();
  if (conn.mode === "ssh") {
    if (_sshRemoteApiKey)
      return { Authorization: `Bearer ${_sshRemoteApiKey}` };
    return {};
  }
  if (conn.mode === "remote" && conn.apiKey) {
    return { Authorization: `Bearer ${conn.apiKey}` };
  }
  if (conn.mode === "local") {
    const envConfig = readEnv(profile);
    const localKey = envConfig.CUSTOM_API_KEY || envConfig.OPENAI_API_KEY;
    if (localKey) {
      return { Authorization: `Bearer ${localKey}` };
    }
  }
  return {};
}

export async function ensureSshTunnelIfNeeded(): Promise<void> {
  const conn = getConnectionConfig();
  if (
    conn.mode === "ssh" &&
    (!isSshTunnelActive() || !(await isSshTunnelHealthy()))
  ) {
    await startSshTunnel(conn.ssh);
  }
}

const LOCAL_PROVIDERS = new Set([
  "custom",
  "lmstudio",
  "ollama",
  "vllm",
  "llamacpp",
]);

// Map base-URL patterns to the API key env var they need
const URL_KEY_MAP: Array<{ pattern: RegExp; envKey: string }> = [
  { pattern: /openrouter\.ai/i, envKey: "OPENROUTER_API_KEY" },
  { pattern: /anthropic\.com/i, envKey: "ANTHROPIC_API_KEY" },
  { pattern: /openai\.com/i, envKey: "OPENAI_API_KEY" },
  { pattern: /huggingface\.co/i, envKey: "HF_TOKEN" },
  { pattern: /api\.groq\.com/i, envKey: "GROQ_API_KEY" },
  { pattern: /api\.deepseek\.com/i, envKey: "DEEPSEEK_API_KEY" },
  { pattern: /api\.together\.xyz/i, envKey: "TOGETHER_API_KEY" },
  { pattern: /api\.fireworks\.ai/i, envKey: "FIREWORKS_API_KEY" },
  { pattern: /api\.cerebras\.ai/i, envKey: "CEREBRAS_API_KEY" },
  { pattern: /api\.mistral\.ai/i, envKey: "MISTRAL_API_KEY" },
  { pattern: /api\.perplexity\.ai/i, envKey: "PERPLEXITY_API_KEY" },
];

interface ChatHandle {
  abort: () => void;
}

function cleanBaseUrl(url: string): string {
  return url.replace(/\/v1\/?$/, "");
}

// ────────────────────────────────────────────────────
//  API Server health check
// ────────────────────────────────────────────────────

function isApiServerReady(): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `${cleanBaseUrl(getApiUrl())}/health`;
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(
      url,
      { method: "GET", timeout: 1500, headers: getRemoteAuthHeader() },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// ────────────────────────────────────────────────────
//  Ensure API server is enabled in config
// ────────────────────────────────────────────────────

function ensureApiServerConfig(): void {
  try {
    const configPath = join(OMNIWORKER_HOME, "config.yaml");
    if (!existsSync(configPath)) return;
    const content = readFileSync(configPath, "utf-8");
    // If api_server is already configured, skip
    if (/api_server/i.test(content)) return;
    const addition = `
# Desktop app API server (auto-configured)
platforms:
  api_server:
    enabled: true
    extra:
      port: 8642
      host: "127.0.0.1"
`;
    appendFileSync(configPath, addition, "utf-8");
  } catch {
    /* non-fatal */
  }
}

// ────────────────────────────────────────────────────
//  HTTP API streaming (fast path — no process spawn)
// ────────────────────────────────────────────────────

export interface ChatCallbacks {
  onChunk: (text: string) => void;
  onDone: (sessionId?: string) => void;
  onError: (error: string) => void;
  onToolProgress?: (tool: string) => void;
  onUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
    rateLimitRemaining?: number;
    rateLimitReset?: number;
  }) => void;
}

function sendMessageViaApi(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  _resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
): ChatHandle {
  const mc = getModelConfig(profile);
  const controller = new AbortController();

  // Build full conversation from history + current message (standard OpenAI format)
  const messages: Array<{ role: string; content: string }> = [];
  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({
        role: msg.role === "agent" ? "assistant" : msg.role,
        content: msg.content,
      });
    }
  }
  messages.push({ role: "user", content: message });

  const body = JSON.stringify({
    model: mc.model || "omniworker-agent",
    messages,
    stream: true,
    ...(_resumeSessionId ? { session_id: _resumeSessionId } : {}),
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getRemoteAuthHeader(profile),
  };

  let sessionId = _resumeSessionId || "";
  let hasContent = false;
  let finished = false; // guard against double callbacks
  let lastError = ""; // capture embedded error messages
  // Tool progress pattern: `emoji tool_name` or `emoji description`
  const toolProgressRe = /^`([^\s`]+)\s+([^`]+)`$/;

  let watchdogTimer: NodeJS.Timeout | null = null;

  function resetWatchdog(): void {
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
    }
    watchdogTimer = setTimeout(() => {
      console.warn("[Watchdog] Stream inactive for 90s. Aborting request.");
      controller.abort();
      finish("Agent appears unresponsive (90s inactivity timeout). Please check if the gateway is running and try again.");
    }, 90000);
  }

  function clearWatchdog(): void {
    if (watchdogTimer) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function finish(error?: string): void {
    clearWatchdog();
    if (finished) return;
    finished = true;
    if (error) {
      cb.onError(error);
    } else {
      cb.onDone(sessionId || undefined);
    }
  }

  function probeRealError(): void {
    // When streaming returns empty, make a non-streaming request to surface the real error
    const probeBody = JSON.stringify({
      model: mc.model || "omniworker-agent",
      messages: [{ role: "user", content: message }],
      stream: false,
    });
    const probeUrl = `${cleanBaseUrl(getApiUrl())}/v1/chat/completions`;
    const probeMod = probeUrl.startsWith("https") ? https : http;
    const probeReq = probeMod.request(
      probeUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getRemoteAuthHeader(profile),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (d) => {
          raw += d.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const content = parsed.choices?.[0]?.message?.content || "";
            const errMsg = parsed.error?.message || "";
            finish(
              content ||
                errMsg ||
                "No response received from the model. Check your model configuration and API key.",
            );
          } catch {
            finish(
              "No response received from the model. Check your model configuration and API key.",
            );
          }
        });
      },
    );
    probeReq.on("error", () => {
      finish(
        "No response received from the model. Check your model configuration and API key.",
      );
    });
    probeReq.write(probeBody);
    probeReq.end();
  }

  /** Handle a custom SSE event (non-data lines with `event:` prefix). */
  function processCustomEvent(eventType: string, data: string): void {
    if (eventType === "omniworker.tool.progress" && cb.onToolProgress) {
      try {
        const payload = JSON.parse(data);
        const label = payload.label || payload.tool || "";
        const emoji = payload.emoji || "";
        cb.onToolProgress(emoji ? `${emoji} ${label}` : label);
      } catch {
        /* malformed — skip */
      }
    }
  }

  function processSseData(data: string): boolean {
    if (data === "[DONE]") {
      if (hasContent) {
        finish();
      } else if (lastError) {
        finish(lastError);
      } else {
        // Streaming returned empty — probe non-streaming to get the real error
        probeRealError();
      }
      return true; // signals done
    }
    try {
      const parsed = JSON.parse(data);

      // Capture error responses forwarded through SSE
      if (parsed.error) {
        lastError = parsed.error.message || JSON.stringify(parsed.error);
        return false;
      }

      const choice = parsed.choices?.[0];
      const delta = choice?.delta;

      // Extract usage from final chunk (with optional cost + rate limit info)
      if (parsed.usage && cb.onUsage) {
        cb.onUsage({
          promptTokens: parsed.usage.prompt_tokens || 0,
          completionTokens: parsed.usage.completion_tokens || 0,
          totalTokens: parsed.usage.total_tokens || 0,
          cost: parsed.usage.cost,
          rateLimitRemaining: parsed.usage.rate_limit_remaining,
          rateLimitReset: parsed.usage.rate_limit_reset,
        });
      }

      if (delta?.content) {
        const content = delta.content.trim();
        // Legacy: Detect tool progress lines injected into content: `🔍 search_web`
        const match = toolProgressRe.exec(content);
        if (match && cb.onToolProgress) {
          cb.onToolProgress(`${match[1]} ${match[2]}`);
        } else {
          hasContent = true;
          cb.onChunk(delta.content);
        }
      }
    } catch {
      /* malformed chunk — skip */
    }
    return false;
  }

  const chatUrl = `${cleanBaseUrl(getApiUrl())}/v1/chat/completions`;
  const requester = chatUrl.startsWith("https") ? https.request : http.request;
  const req = requester(
    chatUrl,
    {
      method: "POST",
      headers,
      signal: controller.signal,
      timeout: 120000,
    },
    (res) => {
      const sid = res.headers["x-omniworker-session-id"];
      if (sid && typeof sid === "string") sessionId = sid;

      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d) => {
          errBody += d.toString();
        });
        res.on("end", () => {
          try {
            const err = JSON.parse(errBody);
            finish(err.error?.message || `API error ${res.statusCode}`);
          } catch {
            finish(
              `API server returned ${res.statusCode}: ${errBody.slice(0, 200)}`,
            );
          }
        });
        return;
      }

      let buffer = "";

      /** Parse an SSE block which may contain `event:` and `data:` lines. */
      function processSseBlock(block: string): boolean {
        let eventType = "";
        let dataLine = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataLine = line.slice(6);
          }
        }
        if (!dataLine) return false;
        if (eventType) {
          // Custom event (e.g. omniworker.tool.progress) — never signals [DONE]
          processCustomEvent(eventType, dataLine);
          return false;
        }
        return processSseData(dataLine);
      }

      res.on("data", (chunk: Buffer) => {
        resetWatchdog();
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (processSseBlock(part)) return;
        }
      });

      res.on("end", () => {
        if (buffer.trim()) {
          for (const part of buffer.split("\n\n")) {
            if (processSseBlock(part)) return;
          }
        }
        // Signal completion — even when no content was received
        if (!hasContent && !lastError) {
          probeRealError();
          return;
        }
        finish(hasContent ? undefined : lastError);
      });

      res.on("error", (err: any) => {
        if (controller.signal.aborted || err.message === "aborted" || err.code === "ECONNRESET") {
          finish();
          return;
        }
        finish(`Stream error: ${err.message}`);
      });
    },
  );

  req.on("error", (err) => {
    if (err.name === "AbortError") return;
    finish(`API request failed: ${err.message}`);
  });
  req.on("timeout", () => {
    req.destroy();
    finish(
      "API request timed out. Check the SSH tunnel and remote Flux Agent By Simplex gateway.",
    );
  });

  resetWatchdog();
  req.write(body);
  req.end();

  return {
    abort: () => {
      controller.abort();
    },
  };
}

// ────────────────────────────────────────────────────
//  CLI fallback (slow path — spawns process)
// ────────────────────────────────────────────────────

const NOISE_PATTERNS = [/^[╭╰│╮╯─┌┐└┘┤├┬┴┼]/, /⚕\s*Flux Agent/];

function sendMessageViaCli(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
): ChatHandle {
  const mc = getModelConfig(profile);
  const profileEnv = readEnv(profile);

  const args = omniworkerCliArgs();
  if (profile && profile !== "default") {
    args.push("-p", profile);
  }
  args.push("chat", "-q", message, "-Q", "--source", "desktop");

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }

  if (mc.model) {
    args.push("-m", mc.model);
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    OMNIWORKER_HOME: OMNIWORKER_HOME,
    OMNIWORKER_SAAS_BASE_URL:
      process.env.OMNIWORKER_SAAS_BASE_URL || `${SAAS_BASE_URL}/api/v1`,
    PYTHONUNBUFFERED: "1",
  };

  const secureTokens = getSecureTokens();
  if (secureTokens.accessToken) {
    env.OPENAI_API_KEY = secureTokens.accessToken;
    env.CUSTOM_API_KEY = secureTokens.accessToken;
  }

  // Inject all API keys from the profile .env so the CLI can access them
  const KNOWN_API_KEYS = [
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GROQ_API_KEY",
    "GLM_API_KEY",
    "KIMI_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_CN_API_KEY",
    "HF_TOKEN",
    "EXA_API_KEY",
    "PARALLEL_API_KEY",
    "TAVILY_API_KEY",
    "FIRECRAWL_API_KEY",
    "FAL_KEY",
    "HONCHO_API_KEY",
    "BROWSERBASE_API_KEY",
    "BROWSERBASE_PROJECT_ID",
    "VOICE_TOOLS_OPENAI_KEY",
    "TINKER_API_KEY",
    "WANDB_API_KEY",
  ];
  for (const key of KNOWN_API_KEYS) {
    if (profileEnv[key] && !env[key]) {
      env[key] = profileEnv[key];
    }
  }

  const isCustomEndpoint = LOCAL_PROVIDERS.has(mc.provider);
  if (isCustomEndpoint && mc.baseUrl) {
    // Check if this model has an explicit apiMode from custom_providers
    let modelApiMode: string | null = null;
    try {
      const modelEntry = readModels().find(
        (m) => m.baseUrl === mc.baseUrl && m.model === mc.model,
      );
      if (modelEntry) modelApiMode = modelEntry.apiMode || null;
    } catch {
      /* ignore */
    }
    const isAnthropicProtocol = modelApiMode === "anthropic_messages";
    if (isAnthropicProtocol) {
      env.OMNIWORKER_INFERENCE_PROVIDER = "anthropic";
      env.ANTHROPIC_BASE_URL = mc.baseUrl.replace(/\/+$/, "");
    } else {
      env.OMNIWORKER_INFERENCE_PROVIDER = "custom";
      env.OPENAI_BASE_URL = mc.baseUrl.replace(/\/+$/, "");
    }

    // Resolve the right API key: check URL-specific key first, then OPENAI_API_KEY
    let resolvedKey = "";
    for (const { pattern, envKey } of URL_KEY_MAP) {
      if (pattern.test(mc.baseUrl)) {
        resolvedKey = profileEnv[envKey] || env[envKey] || "";
        break;
      }
    }
    if (!resolvedKey) {
      // Try custom provider auto-generated key from models.json
      try {
        const models = readModels();
        const matching = models.find((m) => m.baseUrl === mc.baseUrl);
        if (matching) {
          const envKey2 =
            "CUSTOM_PROVIDER_" +
            matching.name.replace(/[^A-Za-z0-9]/g, "_").toUpperCase() +
            "_KEY";
          resolvedKey = profileEnv[envKey2] || env[envKey2] || "";
        }
      } catch {
        /* ignore */
      }
      if (!resolvedKey) {
        resolvedKey =
          profileEnv.CUSTOM_API_KEY ||
          env.CUSTOM_API_KEY ||
          profileEnv.OPENAI_API_KEY ||
          env.OPENAI_API_KEY ||
          "";
      }
    }
    // Local servers (localhost/127.0.0.1) don't need a real key
    if (!resolvedKey && /localhost|127\.0\.0\.1/i.test(mc.baseUrl)) {
      resolvedKey = "no-key-required";
    }
    if (isAnthropicProtocol) {
      env.ANTHROPIC_API_KEY = resolvedKey || "no-key-required";
    } else {
      env.OPENAI_API_KEY = resolvedKey || "no-key-required";
    }

    delete env.OPENROUTER_API_KEY;
    delete env.ANTHROPIC_TOKEN;
    delete env.OPENROUTER_BASE_URL;
  }

  // Prevent sleep during active agent conversation/reasoning tasks
  try {
    PowerManager.startBlocking();
  } catch (e) {
    console.error("[CONVERSATION] Failed to start PowerManager block:", e);
  }

  let isPowerBlockReleased = false;
  const releasePowerBlock = () => {
    if (isPowerBlockReleased) return;
    isPowerBlockReleased = true;
    try {
      PowerManager.stopBlocking();
    } catch (e) {
      console.error("[CONVERSATION] Failed to stop PowerManager block:", e);
    }
  };

  const proc = spawn(OMNIWORKER_PYTHON, args, {
    cwd: OMNIWORKER_REPO,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    ...HIDDEN_SUBPROCESS_OPTIONS,
  });

  if (proc.pid) {
    recordPid(proc.pid);
    proc.on("close", () => {
      unrecordPid(proc.pid!);
    });
  }

  let hasOutput = false;
  let capturedSessionId = "";
  let outputBuffer = "";

  function processOutput(raw: Buffer): void {
    const text = stripAnsi(raw.toString());
    outputBuffer += text;

    const sidMatch = outputBuffer.match(/session_id:\s*(\S+)/);
    if (sidMatch) capturedSessionId = sidMatch[1];

    const cleaned = text.replace(/session_id:\s*\S+\n?/g, "");
    const lines = cleaned.split("\n");
    const result: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t && NOISE_PATTERNS.some((p) => p.test(t))) continue;
      result.push(line);
    }

    const output = result.join("\n");
    if (output) {
      hasOutput = true;
      cb.onChunk(output);
    }
  }

  proc.stdout?.on("data", processOutput);

  let stderrBuffer = "";
  proc.stderr?.on("data", (data: Buffer) => {
    const text = stripAnsi(data.toString());
    if (
      !text.trim() ||
      text.includes("UserWarning") ||
      text.includes("FutureWarning")
    ) {
      return;
    }
    stderrBuffer += text;
    // Forward errors visibly to the chat in real-time
    if (
      /❌|⚠️|Error|Traceback|error|failed|denied|unauthorized|invalid/i.test(
        text,
      )
    ) {
      hasOutput = true;
      cb.onChunk(text);
    }
  });

  proc.on("close", (code) => {
    releasePowerBlock();
    console.log(`[OmniWorker Agent] Process closed with code ${code}. hasOutput=${hasOutput}`);
    if (code === 0) {
      cb.onDone(capturedSessionId || undefined);
    } else {
      const detail = stderrBuffer.trim();
      cb.onError(
        detail
          ? `Flux Agent By Simplex exited with code ${code}:\n${detail}`
          : `Flux Agent By Simplex exited with code ${code}. Check your model configuration and API key.`,
      );
    }
  });

  proc.on("error", (err) => {
    releasePowerBlock();
    cb.onError(err.message);
  });

  return {
    abort: () => {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 3000);
    },
  };
}

// ────────────────────────────────────────────────────
//  Public API: auto-routes to HTTP API or CLI fallback
// ────────────────────────────────────────────────────

let apiServerAvailable: boolean | null = null; // cached after first check

// ────────────────────────────────────────────────────
//  Local SLM Router — classify messages for local vs cloud
// ────────────────────────────────────────────────────

const LOCAL_SLM_PORT = parseInt(
  process.env.OMNIWORKER_LOCAL_SLM_PORT ?? "8080",
  10,
);

/**
 * Classify a message as "simple" (→ local SLM) or "complex" (→ cloud SaaS).
 * Simple: greetings, short questions, yes/no, basic chitchat, no history.
 * Complex: code, long text, tool use, multi-turn reasoning.
 */
function shouldUseLocalSlm(
  message: string,
  history?: Array<{ role: string; content: string }>,
): boolean {
  // If local SLM is disabled, bypass immediately to save socket probe latency
  if (process.env.DISABLE_LOCAL_SLM === "true" || process.env.DISABLE_LOCAL_SLM === "True") {
    return false;
  }

  // Multi-turn → always cloud
  if (history && history.length > 0) return false;

  const trimmed = message.trim();

  // Very short (< 15 chars) — greetings, yes/no
  if (trimmed.length <= 15) return true;

  // Simple greeting/thanks patterns
  const simplePatterns =
    /^(hola|hi|hello|hey|buenos días|buenas|gracias|thanks|bye|adiós|ok|sí|no|yes|nope|sure|claro|dale|listo|yo|qué tal|qué haces|cómo estás|how are you|what's up|sup|good morning|good night|buenas noches)[\s!.?]*$/i;
  if (simplePatterns.test(trimmed)) return true;

  // Medium (15-100 chars) with no code indicators → local
  if (trimmed.length <= 100) {
    const codeIndicators =
      /```|function |class |import |const |def |async |await |SELECT |CREATE |npm |git |pip |python|error|traceback|exception|debug|fix|archivo|file|install|configurar/i;
    if (!codeIndicators.test(trimmed)) return true;
  }

  return false;
}

/**
 * Send a message to the local SLM (llama-server).
 * Returns null if SLM is not available, letting the caller fallback.
 */
function sendMessageViaLocalSlm(
  message: string,
  cb: ChatCallbacks,
): ChatHandle | null {
  const controller = new AbortController();
  const slmUrl = `http://127.0.0.1:${LOCAL_SLM_PORT}/v1/chat/completions`;

  const body = JSON.stringify({
    model: "slm",
    messages: [{ role: "user", content: message }],
    stream: true,
  });

  let hasContent = false;
  let finished = false;

  function finish(error?: string): void {
    if (finished) return;
    finished = true;
    if (error) cb.onError(error);
    else cb.onDone();
  }

  const req = http.request(
    slmUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      timeout: 30000,
    },
    (res) => {
      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d: Buffer) => {
          errBody += d.toString();
        });
        res.on("end", () => finish(`Local SLM error ${res.statusCode}`));
        return;
      }

      let buffer = "";
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") {
              finish(hasContent ? undefined : "Local SLM returned empty");
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                hasContent = true;
                cb.onChunk(content);
              }
            } catch {
              /* skip malformed chunk */
            }
          }
        }
      });

      res.on("end", () => {
        // Process any remaining buffer
        if (buffer.trim()) {
          for (const line of buffer.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                hasContent = true;
                cb.onChunk(content);
              }
            } catch {
              /* skip */
            }
          }
        }
        finish(hasContent ? undefined : "No response from local SLM");
      });

      res.on("error", (err) =>
        finish(`Local SLM stream error: ${err.message}`),
      );
    },
  );

  req.on("error", (err) => {
    if (err.name === "AbortError") return;
    finish(`Local SLM unavailable: ${err.message}`);
  });

  req.on("timeout", () => {
    req.destroy();
    finish("Local SLM request timed out");
  });

  req.write(body);
  req.end();

  return {
    abort: () => {
      controller.abort();
    },
  };
}

// ────────────────────────────────────────────────────

export async function sendMessage(
  message: string,
  cb: ChatCallbacks,
  profile?: string,
  resumeSessionId?: string,
  history?: Array<{ role: string; content: string }>,
): Promise<ChatHandle> {
  ensureInitialized();

  // Enforce B2B subscription plan lock
  if (isPlanExpired) {
    setTimeout(() => {
      cb.onError("PLAN_EXPIRED: Tu suscripción de Flux Agent By Simplex ha vencido. Por favor, actualiza tu plan en el panel del SaaS.");
    }, 100);
    return { abort: () => {} };
  }

  // ── LOCAL SLM FAST PATH ──
  // Simple messages (greetings, short Qs) go to local llama-server when available.
  // Only attempt if SLM is actually running (quick TCP probe first).
  if (
    !isRemoteMode() &&
    !resumeSessionId &&
    shouldUseLocalSlm(message, history)
  ) {
    // Quick async probe — is the SLM actually accepting connections?
    const slmAlive = await new Promise<boolean>((resolve) => {
      try {
        const netMod = require("net") as typeof import("net");
        const s = netMod.createConnection({
          port: LOCAL_SLM_PORT,
          host: "127.0.0.1",
        });
        s.setTimeout(500);
        s.once("connect", () => {
          s.destroy();
          resolve(true);
        });
        s.once("error", () => {
          s.destroy();
          resolve(false);
        });
        s.once("timeout", () => {
          s.destroy();
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });

    if (slmAlive) {
      const slmHandle = sendMessageViaLocalSlm(message, cb);
      if (slmHandle) return slmHandle;
    }
    // SLM not available — fall through to gateway/cloud
  }

  // Remote mode: always use API, no CLI fallback
  if (isRemoteMode()) {
    return sendMessageViaApi(message, cb, profile, resumeSessionId, history);
  }

  // Ensure memory config defaults are set for local/gateway paths
  ensureMemoryConfig(profile);

  // Check API server availability (cache the result, re-check periodically)
  if (apiServerAvailable === null || apiServerAvailable === false) {
    apiServerAvailable = await isApiServerReady();
  }

  if (apiServerAvailable) {
    return sendMessageViaApi(message, cb, profile, resumeSessionId, history);
  }

  // Fallback to CLI
  return sendMessageViaCli(message, cb, profile, resumeSessionId);
}

// Lazy init — called on first sendMessage or gateway start
let _initialized = false;
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

function ensureInitialized(): void {
  if (_initialized) return;
  _initialized = true;
  if (!isRemoteMode()) {
    ensureApiServerConfig();
    ensureLocalLlmScripts(); // Copy startup scripts on first run
    startSmartRouter().catch((e) =>
      console.error("[SmartRouter] Init failed", e),
    ); // Start smart router so gateway has it available
  }
  startHealthPolling();
}

/**
 * Copy bundled local-llm startup scripts from app resources into
 * OMNIWORKER_HOME/local-llm/ so startLocalLlmServer() can find them.
 * Safe to call multiple times — only copies if destination is missing.
 */
function ensureLocalLlmScripts(): void {
  try {
    const fs = require("fs");
    const { app } = require("electron");
    const srcDir = join(app.getAppPath(), "resources", "local-llm-scripts");
    const engineSrcDir = join(app.getAppPath(), "resources", "engine");
    const destScriptsDir = join(OMNIWORKER_HOME, "local-llm", "scripts");
    const destEngineDir = join(OMNIWORKER_HOME, "local-llm", "engine");

    if (!existsSync(srcDir)) return; // not packaged yet (dev mode)

    mkdirSync(destScriptsDir, { recursive: true });

    // Si existe la carpeta física pero está vacía o es un directorio normal y existe engineSrcDir,
    // la removemos para que symlinkSync pueda crearlo como link.
    if (existsSync(engineSrcDir) && existsSync(destEngineDir)) {
      try {
        const lstat = fs.lstatSync(destEngineDir);
        if (lstat.isDirectory() && !lstat.isSymbolicLink()) {
          fs.rmdirSync(destEngineDir);
        }
      } catch (err) {
        // Si tiene archivos (como slm.gguf descargado), no la borramos
      }
    }

    if (!existsSync(destEngineDir) && !existsSync(engineSrcDir)) {
      mkdirSync(destEngineDir, { recursive: true });
    }

    // Copy startup scripts
    for (const f of ["start-local-llm.sh", "start-local-llm.bat"]) {
      const src = join(srcDir, f);
      const dst = join(destScriptsDir, f);
      if (existsSync(src) && !existsSync(dst)) {
        copyFileSync(src, dst);
        if (f.endsWith(".sh")) chmodSync(dst, 0o755);
      }
    }

    // Symlink engine dir so scripts can reference ../engine relative to scripts/
    const engineLink = join(OMNIWORKER_HOME, "local-llm", "engine");
    if (existsSync(engineSrcDir) && !existsSync(engineLink)) {
      symlinkSync(engineSrcDir, engineLink);
    }
  } catch (e) {
    console.warn("[local-llm] ensureLocalLlmScripts failed:", e);
  }
}

function startHealthPolling(): void {
  if (_healthCheckInterval) return;
  _healthCheckInterval = setInterval(async () => {
    apiServerAvailable = await isApiServerReady();
    // Stop polling once API is confirmed available — only re-check on demand
    if (apiServerAvailable && _healthCheckInterval) {
      clearInterval(_healthCheckInterval);
      _healthCheckInterval = null;
    }
  }, 15000);
}

export function stopHealthPolling(): void {
  if (_healthCheckInterval) {
    clearInterval(_healthCheckInterval);
    _healthCheckInterval = null;
  }
}

// ────────────────────────────────────────────────────
//  Local LLM server management
// ────────────────────────────────────────────────────

let localLlmProcess: ChildProcess | null = null;

const _LOCAL_LLM_PORT_ORIG = parseInt(
  process.env.OMNIWORKER_LOCAL_SLM_PORT ?? "8080",
  10,
);

function isLocalLlmRunning(): Promise<boolean> {
  // Synchronous TCP probe — fast (300 ms timeout) and no external deps.
  // Returns true if llama-server is already bound on the configured port.
  try {
    const net = require("net") as typeof import("net");
    return new Promise<boolean>((resolve) => {
      const s = net.createConnection({
        port: _LOCAL_LLM_PORT_ORIG,
        host: "127.0.0.1",
      });
      s.setTimeout(300);
      s.once("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.once("error", () => {
        s.destroy();
        resolve(false);
      });
      s.once("timeout", () => {
        s.destroy();
        resolve(false);
      });
    });
  } catch {
    return Promise.resolve(false);
  }
}

export async function startLocalLlmServer(): Promise<boolean> {
  if (process.env.DISABLE_LOCAL_SLM === "true" || process.env.DISABLE_LOCAL_SLM === "True") {
    return false;
  }

  const scriptPath = join(
    OMNIWORKER_HOME,
    "local-llm",
    "scripts",
    "start-local-llm.sh",
  );
  const winScriptPath = join(
    OMNIWORKER_HOME,
    "local-llm",
    "scripts",
    "start-local-llm.bat",
  );

  const startScript =
    process.platform === "win32" && existsSync(winScriptPath)
      ? winScriptPath
      : scriptPath;

  if (!existsSync(startScript)) {
    return false; // Local LLM not installed
  }

  if (await isLocalLlmRunning()) {
    return true; // Already running
  }

  if (localLlmProcess && !localLlmProcess.killed) {
    return true; // Already started by us
  }

  const env = {
    ...process.env,
    PATH: getEnhancedPath(),
    HOME: homedir(),
  };

  const command = process.platform === "win32" ? "cmd.exe" : "bash";
  const args =
    process.platform === "win32" ? ["/c", startScript] : [startScript];

  localLlmProcess = spawn(command, args, {
    cwd: OMNIWORKER_HOME,
    env,
    stdio: "ignore",
    ...HIDDEN_SUBPROCESS_OPTIONS,
  });

  if (localLlmProcess.pid) {
    recordPid(localLlmProcess.pid);
  }

  localLlmProcess.unref();
  localLlmProcess.on("close", () => {
    if (localLlmProcess && localLlmProcess.pid) {
      unrecordPid(localLlmProcess.pid);
    }
    localLlmProcess = null;
  });

  return true;
}

//  Smart Router management
// ────────────────────────────────────────────────────

const SMART_ROUTER_PORT = parseInt(process.env.SMART_ROUTER_PORT ?? "8341", 10);

let smartRouterProcess: ChildProcess | null = null;

/**
 * Check if the smart router is running on port 8341.
 */
export function isSmartRouterRunning(): Promise<boolean> {
  try {
    const net = require("net") as typeof import("net");
    return new Promise<boolean>((resolve) => {
      const s = net.createConnection({
        port: SMART_ROUTER_PORT,
        host: "127.0.0.1",
      });
      s.setTimeout(300);
      s.once("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.once("error", () => {
        s.destroy();
        resolve(false);
      });
      s.once("timeout", () => {
        s.destroy();
        resolve(false);
      });
    });
  } catch {
    return Promise.resolve(false);
  }
}

export async function forceKillPort(port: number): Promise<boolean> {
  const { execSync } = require("child_process") as typeof import("child_process");
  const isWin = process.platform === "win32";

  try {
    if (isWin) {
      const output = execSync(`netstat -ano -p tcp`).toString();
      const lines = output.split("\n");
      const pidRegex = new RegExp(`:${port}\\s+.*LISTENING\\s+(\\d+)`, "i");
      for (const line of lines) {
        const match = pidRegex.exec(line);
        if (match && match[1]) {
          const pid = parseInt(match[1], 10);
          if (pid > 0) {
            console.log(`[SmartRouter] Force killing stale process PID ${pid} on port ${port} via taskkill`);
            execSync(`taskkill /F /PID ${pid}`);
            return true;
          }
        }
      }
    } else {
      try {
        const pidStr = execSync(`lsof -t -i :${port}`).toString().trim();
        if (pidStr) {
          const pids = pidStr.split("\n").map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));
          for (const pid of pids) {
            if (pid > 0) {
              console.log(`[SmartRouter] Force killing stale process PID ${pid} on port ${port} via SIGKILL`);
              process.kill(pid, "SIGKILL");
            }
          }
          return true;
        }
      } catch (err) {
        // ignore
      }
    }
  } catch (error) {
    console.error(`[SmartRouter] Failed to force-kill port ${port}:`, error);
  }
  return false;
}

import { SMART_ROUTER_SCRIPT } from "./smartRouterScript";

/**
 * Start the smart router proxy that routes inference between local SLM and cloud.
 * Must be called AFTER login (needs OPENAI_API_KEY and CLOUD_API_URL in env).
 */
export async function startSmartRouter(): Promise<boolean> {
  const isRunning = await isSmartRouterRunning();
  if (isRunning) {
    if (smartRouterProcess) {
      return true; // Already running and managed by this session
    }
    // It's running but NOT managed by this session (meaning it's a stale orphan process!)
    console.log("[SmartRouter] Stale orphan router process detected on port", SMART_ROUTER_PORT);
    await forceKillPort(SMART_ROUTER_PORT);
    // Give it a brief moment to release the port
    await new Promise((r) => setTimeout(r, 500));
  }

  const routerScript = join(OMNIWORKER_REPO, "smart_router.py");
  if (!existsSync(routerScript)) {
    console.log(
      "[SmartRouter] Script not found natively. Writing bundled version...",
    );
    mkdirSync(OMNIWORKER_REPO, { recursive: true });
    writeFileSync(routerScript, SMART_ROUTER_SCRIPT);
  }

  // Get current env to pass auth credentials to router
  const conn = getConnectionConfig();
  const envConfig = readEnv();

  // Central sanitization of dead domain worker.thelab.lat
  if (process.env.VITE_SAAS_URL && process.env.VITE_SAAS_URL.includes("worker.thelab.lat")) {
    process.env.VITE_SAAS_URL = "https://flux.simplex.lat";
  }
  if (process.env.CLOUD_API_URL && process.env.CLOUD_API_URL.includes("worker.thelab.lat")) {
    process.env.CLOUD_API_URL = "https://flux.simplex.lat/api";
  }
  if (envConfig.CLOUD_API_URL && envConfig.CLOUD_API_URL.includes("worker.thelab.lat")) {
    console.log("[SmartRouter] Dead domain worker.thelab.lat detected in envConfig. Migrating to flux.simplex.lat...");
    setEnvValue("CLOUD_API_URL", "https://flux.simplex.lat/api");
    envConfig.CLOUD_API_URL = "https://flux.simplex.lat/api";
  }

  let cloudApiUrl = process.env.CLOUD_API_URL || envConfig.CLOUD_API_URL || `${SAAS_BASE_URL}/api`;
  if (conn.mode === "local") {
    cloudApiUrl = envConfig.CUSTOM_BASE_URL || envConfig.CLOUD_API_URL || `${SAAS_BASE_URL}/api`;
  }

  const forceIpv4 = getConfigValue("network.force_ipv4") === "true";

  const routerEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    SMART_ROUTER_PORT: String(SMART_ROUTER_PORT),
    LOCAL_SLM_PORT: process.env.OMNIWORKER_LOCAL_SLM_PORT ?? "8080",
    CLOUD_API_URL: cloudApiUrl,
    SMART_ROUTER_LOG: "1", // Enable logging
    FORCE_IPV4: forceIpv4 ? "true" : "false",
  };

  // Forward the JWT token or local API key so the router can auth with cloud
  let apiKey = "";
  if (conn.mode === "remote" && conn.apiKey) {
    apiKey = conn.apiKey;
  } else {
    apiKey =
      process.env.OPENAI_API_KEY ||
      envConfig.OPENAI_API_KEY ||
      envConfig.CUSTOM_API_KEY ||
      "";
  }

  if (apiKey) {
    routerEnv.OPENAI_API_KEY = apiKey;
  }

  const args = [OMNIWORKER_PYTHON, routerScript];

  smartRouterProcess = spawn(args[0], args.slice(1), {
    cwd: OMNIWORKER_REPO,
    env: routerEnv,
    stdio: "ignore",
    ...HIDDEN_SUBPROCESS_OPTIONS,
  });

  if (smartRouterProcess.pid) {
    recordPid(smartRouterProcess.pid);
  }

  smartRouterProcess.unref();
  smartRouterProcess.on("close", () => {
    if (smartRouterProcess && smartRouterProcess.pid) {
      unrecordPid(smartRouterProcess.pid);
    }
    smartRouterProcess = null;
  });
  smartRouterProcess.on("error", (err) => {
    console.error("[SmartRouter] Process error:", err);
    if (smartRouterProcess && smartRouterProcess.pid) {
      unrecordPid(smartRouterProcess.pid);
    }
    smartRouterProcess = null;
  });

  console.log(
    "[SmartRouter] Started process, waiting for port",
    SMART_ROUTER_PORT,
  );

  // Wait for the port to be available
  for (let i = 0; i < 20; i++) {
    if (await isSmartRouterRunning()) {
      console.log("[SmartRouter] Ready on port", SMART_ROUTER_PORT);
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.error(
    "[SmartRouter] Failed to detect running router on port",
    SMART_ROUTER_PORT,
  );
  return false;
}

/**
 * Stop the smart router process.
 */
export function stopSmartRouter(): void {
  if (smartRouterProcess && !smartRouterProcess.killed) {
    smartRouterProcess.kill("SIGTERM");
    smartRouterProcess = null;
  }
}

/**
 * Get the smart router base URL for config.yaml.
 * Returns "http://localhost:8341/v1" if router is available, else falls back to direct cloud.
 */
export async function getSmartRouterUrl(
  cloudFallback: string,
): Promise<string> {
  if (await isSmartRouterRunning()) {
    return `http://127.0.0.1:${SMART_ROUTER_PORT}/v1`;
  }
  return cloudFallback;
}

//  Gateway management
// ────────────────────────────────────────────────────

let gatewayProcess: ChildProcess | null = null;
let gatewayStartedByApp = false;

export async function startGateway(profile?: string): Promise<boolean> {
  ensureInitialized();
  if (gatewayProcess && !gatewayProcess.killed) {
    return true; // Already running and managed
  }
  const isRunning = isGatewayRunning();
  if (isRunning) {
    console.log("[Gateway] Stale orphan gateway detected or port 8642 in use. Force killing...");
    await forceKillPort(8642);
    const stalePid = readPidFile();
    if (stalePid) {
      try {
        console.log(`[Gateway] Force killing stale orphan gateway PID ${stalePid} via SIGKILL`);
        process.kill(stalePid, "SIGKILL");
      } catch {
        // already dead or couldn't kill
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Ensure memory config defaults are present before gateway starts.
  // This guarantees background memory review works in local mode.
  ensureMemoryConfig(profile);

  // Build gateway env with profile API keys
  const gatewayEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getEnhancedPath(),
    HOME: homedir(),
    OMNIWORKER_HOME: OMNIWORKER_HOME,
    API_SERVER_ENABLED: "true", // Ensure API server starts with gateway
  };

  // Inject ALL profile API keys so the gateway can authenticate with any provider.
  const profileEnv = readEnv(profile);
  for (const [key, value] of Object.entries(profileEnv)) {
    if (value) {
      gatewayEnv[key] = value;
    }
  }

  const secureTokens = getSecureTokens();
  if (secureTokens.accessToken) {
    gatewayEnv.OPENAI_API_KEY = secureTokens.accessToken;
    gatewayEnv.CUSTOM_API_KEY = secureTokens.accessToken;
  }

  // NOTE: Do NOT set API_SERVER_KEY for the local gateway.
  // The gateway binds to 127.0.0.1 and its _check_auth allows all requests
  // when no key is configured ("local-only use"). Setting it from CUSTOM_API_KEY
  // causes permanent auth desync because the JWT rotates every ~12 min but the
  // gateway process keeps the stale token in memory → 401 on every request.
  delete gatewayEnv.API_SERVER_KEY;

  // Sync the current JWT into config.yaml so the agent's "custom" provider
  // uses the fresh token for SaaS API calls. The JWT rotates on login/refresh,
  // and the agent reads api_key from config.yaml at startup.
  const jwtToken = secureTokens.accessToken || profileEnv.CUSTOM_API_KEY || profileEnv.OPENAI_API_KEY;
  if (jwtToken) {
    try {
      const configPath = profilePaths(profile).configFile;
      const fsSync = require("fs") as typeof import("fs");
      if (fsSync.existsSync(configPath)) {
        let yaml = fsSync.readFileSync(configPath, "utf-8");
        // Replace api_key line under model section (matches any quoted value)
        yaml = yaml.replace(
          /^(\s+api_key:\s*)"[^"]*".*$/m,
          `$1"${jwtToken}"  # Auto-synced JWT from desktop login`,
        );
        fsSync.writeFileSync(configPath, yaml, "utf-8");
      }
    } catch {
      /* Non-fatal — gateway can still start without config sync */
    }
  }

  const fs = require("fs");
  const logFd = fs.openSync(join(OMNIWORKER_HOME, "gateway.log"), "a");

  gatewayProcess = spawn(OMNIWORKER_PYTHON, omniworkerCliArgs(["gateway"]), {
    cwd: OMNIWORKER_REPO,
    env: gatewayEnv,
    stdio: ["ignore", logFd, logFd],
    ...HIDDEN_SUBPROCESS_OPTIONS,
  });

  if (gatewayProcess && gatewayProcess.pid) {
    recordPid(gatewayProcess.pid);
    try {
      const pidFile = join(OMNIWORKER_HOME, "gateway.pid");
      fs.writeFileSync(pidFile, gatewayProcess.pid.toString(), "utf-8");
      console.log(`[Gateway] Wrote spawned PID ${gatewayProcess.pid} to ${pidFile}`);
    } catch (err) {
      console.error("[Gateway] Failed to write PID file:", err);
    }
  }

  gatewayProcess.unref();

  gatewayProcess.on("close", () => {
    if (gatewayProcess && gatewayProcess.pid) {
      unrecordPid(gatewayProcess.pid);
    }
    gatewayProcess = null;
    gatewayStartedByApp = false;
    apiServerAvailable = false;
    // Restart health polling to detect if gateway comes back
    startHealthPolling();
  });
  gatewayProcess.on("error", (err) => {
    console.error("[Gateway] Process error:", err);
    if (gatewayProcess && gatewayProcess.pid) {
      unrecordPid(gatewayProcess.pid);
    }
    gatewayProcess = null;
    gatewayStartedByApp = false;
  });

  gatewayStartedByApp = true;

  // Wait a bit then check if API server came up
  setTimeout(async () => {
    apiServerAvailable = await isApiServerReady();
  }, 3000);

  return true;
}

function readPidFile(): number | null {
  const pidFile = join(OMNIWORKER_HOME, "gateway.pid");
  if (!existsSync(pidFile)) return null;
  try {
    const raw = readFileSync(pidFile, "utf-8").trim();
    // PID file can be JSON ({"pid": 1234, ...}) or plain integer
    const parsed = raw.startsWith("{")
      ? JSON.parse(raw).pid
      : parseInt(raw, 10);
    return typeof parsed === "number" && !isNaN(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function stopGateway(force = false): void {
  if (!force && !gatewayStartedByApp) return;

  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill("SIGTERM");
    gatewayProcess = null;
  }
  const pid = readPidFile();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already dead
    }
  }
  // Always clear the PID file once we've signalled it. Leaving a stale PID
  // around means the next isGatewayRunning() / stopGateway() call can hit
  // an unrelated process that the OS has since assigned the same PID.
  const pidFile = join(OMNIWORKER_HOME, "gateway.pid");
  if (existsSync(pidFile)) {
    try {
      unlinkSync(pidFile);
    } catch {
      // best-effort; will be overwritten on next gateway start
    }
  }
  gatewayStartedByApp = false;
  apiServerAvailable = false;
}

export function isGatewayRunning(): boolean {
  if (gatewayProcess && !gatewayProcess.killed) return true;
  const pid = readPidFile();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isApiReady(): boolean {
  return apiServerAvailable === true;
}

export function testRemoteConnection(
  url: string,
  apiKey?: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const target = `${url.replace(/\/+$/, "")}/health`;
    const mod = target.startsWith("https") ? https : http;
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const req = mod.request(
      target,
      { method: "GET", timeout: 5000, headers },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export async function restartGateway(profile?: string): Promise<void> {
  if (!gatewayStartedByApp && !isGatewayRunning()) return;
  stopGateway(true);
  await new Promise((r) => setTimeout(r, 1000));
  await startGateway(profile);
}
