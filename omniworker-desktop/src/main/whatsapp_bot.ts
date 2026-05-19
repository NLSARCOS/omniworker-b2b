import { spawn, ChildProcess, spawnSync } from "child_process";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { createConnection } from "net";
import { getEnhancedPath, OMNIWORKER_HOME } from "./installer";
import { stripAnsi, safeWriteFile } from "./utils";

const BOT_DIR = join(OMNIWORKER_HOME, "whatsapp-bot");
const SETTINGS_FILE = join(BOT_DIR, "settings.json");
const PID_FILE = join(OMNIWORKER_HOME, "whatsapp-bot.pid");
const PORT_FILE = join(OMNIWORKER_HOME, "whatsapp-bot-port");
const LOG_BUFFER_MAX = 50000;
const DEFAULT_PORT = 8000;

let botProcess: ChildProcess | null = null;
let botLogs = "";
let botError = "";

// ── Interfaces ────────────────────────────────────────────────

export interface WhatsAppBotStatus {
  configured: boolean;
  running: boolean;
  port: number;
  portInUse: boolean;
  provider: string;
  businessName: string;
  agentName: string;
  error: string;
}

export interface WhatsAppBotSettings {
  businessName: string;
  businessDescription: string;
  agentPurpose: string;
  agentName: string;
  tone: string;
  hours: string;
  provider: string;
  port: number;
  credentials: Record<string, string>;
}

export interface WhatsAppBotSetupProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

interface ConversationSummary {
  phone: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
}

// ── Helpers ───────────────────────────────────────────────────

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.setTimeout(300);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(file: string): number | null {
  try {
    const pid = parseInt(readFileSync(file, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePid(file: string, pid: number): void {
  safeWriteFile(file, String(pid));
}

function cleanupPid(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    /* ignore */
  }
}

function getSavedPort(): number {
  try {
    return parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10);
  } catch {
    return DEFAULT_PORT;
  }
}

function setSavedPort(port: number): void {
  safeWriteFile(PORT_FILE, String(port));
}

function readSettings(): WhatsAppBotSettings | null {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function writeSettings(settings: WhatsAppBotSettings): void {
  mkdirSync(BOT_DIR, { recursive: true });
  safeWriteFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function appendLog(text: string): void {
  const clean = stripAnsi(text);
  botLogs += clean;
  if (botLogs.length > LOG_BUFFER_MAX) {
    botLogs = botLogs.slice(botLogs.length - LOG_BUFFER_MAX);
  }
}

function isBotProcessRunning(): boolean {
  if (botProcess && !botProcess.killed) return true;
  const pid = readPid(PID_FILE);
  if (pid && isProcessRunning(pid)) return true;
  cleanupPid(PID_FILE);
  return false;
}

function findPython(): string {
  const candidates =
    process.platform === "win32"
      ? ["python.exe", "python3.exe"]
      : ["python3", "python"];

  for (const cmd of candidates) {
    const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [cmd], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    if (result.status === 0 && result.stdout?.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0];
    }
  }
  return process.platform === "win32" ? "python" : "python3";
}

// ── Public API ────────────────────────────────────────────────

export async function getWhatsAppBotStatus(): Promise<WhatsAppBotStatus> {
  const configured = existsSync(join(BOT_DIR, "agent", "main.py"));
  const running = isBotProcessRunning();
  const port = getSavedPort();
  const portInUse = running ? false : await checkPort(port);
  const settings = readSettings();
  const error = botError;

  return {
    configured,
    running,
    port,
    portInUse,
    provider: settings?.provider || "",
    businessName: settings?.businessName || "",
    agentName: settings?.agentName || "",
    error,
  };
}

export async function setupWhatsAppBot(
  settings: WhatsAppBotSettings,
  onProgress: (progress: WhatsAppBotSetupProgress) => void,
): Promise<void> {
  const totalSteps = 3;
  const python = findPython();
  const env = { ...process.env, PATH: getEnhancedPath() };

  // Step 1: Create directory structure
  onProgress({
    step: 1,
    totalSteps,
    title: "Creating bot project",
    detail: `Setting up ${settings.businessName} bot...`,
    log: "",
  });

  mkdirSync(join(BOT_DIR, "agent", "providers"), { recursive: true });
  mkdirSync(join(BOT_DIR, "config"), { recursive: true });
  mkdirSync(join(BOT_DIR, "knowledge"), { recursive: true });

  // Write settings
  writeSettings(settings);

  // Step 2: Generate bot files via agent tool
  onProgress({
    step: 2,
    totalSteps,
    title: "Generating bot files",
    detail: "Creating FastAPI server, AI brain, and providers...",
    log: "",
  });

  // Use the Python tool to generate the bot
  const args = [
    "-c",
    `
import sys
sys.path.insert(0, ".")
import asyncio
from tools.whatsapp_bot import _handle_create_bot
settings = ${JSON.stringify({
      business_name: settings.businessName,
      business_description: settings.businessDescription,
      agent_purpose: settings.agentPurpose,
      agent_name: settings.agentName,
      tone: settings.tone,
      hours: settings.hours,
      provider: settings.provider,
      port: settings.port,
      anthropic_api_key: "",
      credentials: settings.credentials || {},
    })}
result = asyncio.run(_handle_create_bot(settings))
print(result)
`,
  ];

  // Check if running from omniworker-agent directory
  const agentDir = join(__dirname, "../../../omniworker-agent");
  const cwd = existsSync(join(agentDir, "tools", "whatsapp_bot.py"))
    ? agentDir
    : process.cwd();

  const generateResult = spawnSync(python, args, {
    cwd,
    encoding: "utf8",
    env,
    timeout: 30000,
    windowsHide: true,
  });

  const genLog = (generateResult.stdout || "") + (generateResult.stderr || "");
  appendLog(genLog);

  if (generateResult.status !== 0) {
    const errMsg = `Bot generation failed: ${generateResult.stderr || "Unknown error"}`;
    botError = errMsg;
    throw new Error(errMsg);
  }

  // Step 3: Finish
  onProgress({
    step: 3,
    totalSteps,
    title: "Setup complete",
    detail: `${settings.agentName} is ready!`,
    log: "",
  });

  setSavedPort(settings.port || DEFAULT_PORT);
  botError = "";
}

export async function startWhatsAppBot(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (isBotProcessRunning()) {
    return { success: true };
  }

  if (!existsSync(join(BOT_DIR, "agent", "main.py"))) {
    return { success: false, error: "Bot not configured. Run setup first." };
  }

  const port = getSavedPort();
  const env = { ...process.env, PATH: getEnhancedPath() };

  // Load ~/.omniworker/.env to inherit API keys automatically
  const omniEnvPath = join(OMNIWORKER_HOME, ".env");
  if (existsSync(omniEnvPath)) {
    const omniEnvContent = readFileSync(omniEnvPath, "utf-8");
    for (const line of omniEnvContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim();
          env[key] = value;
        }
      }
    }
  }

  // Also load bot-specific .env (provider tokens, etc.)
  const envPath = join(BOT_DIR, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim();
          env[key] = value;
        }
      }
    }
  }

  // Try OmniWorker's own venv first (reuse installed deps)
  const omniVenvPython =
    process.platform === "win32"
      ? join(OMNIWORKER_HOME, ".venv", "Scripts", "python.exe")
      : join(OMNIWORKER_HOME, ".venv", "bin", "python");

  const pythonCmd = existsSync(omniVenvPython)
    ? omniVenvPython
    : findPython();

  try {
    botProcess = spawn(
      pythonCmd,
      ["-m", "uvicorn", "agent.main:app", "--host", "127.0.0.1", "--port", String(port)],
      {
        cwd: BOT_DIR,
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    botProcess.stdout?.on("data", (data: Buffer) => {
      appendLog(data.toString("utf-8"));
    });

    botProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      appendLog(text);
    });

    botProcess.on("error", (err) => {
      botError = `Bot process error: ${err.message}`;
    });

    botProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        botError = `Bot process exited with code ${code}`;
      }
      cleanupPid(PID_FILE);
      botProcess = null;
    });

    if (botProcess.pid) {
      writePid(PID_FILE, botProcess.pid);
    }

    // Wait for server to be ready
    let attempts = 0;
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 500));
      const inUse = await checkPort(port);
      if (inUse) {
        botError = "";
        return { success: true };
      }
      attempts++;
    }

    botError = "Bot server did not start within 15 seconds";
    return { success: false, error: botError };
  } catch (err) {
    const errMsg = `Failed to start bot: ${(err as Error).message}`;
    botError = errMsg;
    return { success: false, error: errMsg };
  }
}

export function stopWhatsAppBot(): void {
  if (botProcess && !botProcess.killed) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(botProcess.pid), "/f", "/t"], {
          windowsHide: true,
        });
      } else {
        process.kill(-botProcess.pid!, "SIGTERM");
      }
    } catch {
      /* process may have exited */
    }
    botProcess = null;
  }

  // Also check PID file for processes started by a previous session
  const pid = readPid(PID_FILE);
  if (pid) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(pid), "/f", "/t"], {
          windowsHide: true,
        });
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      /* already dead */
    }
  }

  cleanupPid(PID_FILE);
  botError = "";
}

export function getWhatsAppBotLogs(): string {
  return botLogs;
}

export function getWhatsAppBotSettings(): WhatsAppBotSettings | null {
  return readSettings();
}

export function setWhatsAppBotSettings(
  settings: WhatsAppBotSettings,
): { success: boolean; error?: string } {
  try {
    writeSettings(settings);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to save settings: ${(err as Error).message}`,
    };
  }
}

export async function testWhatsAppBot(
  message: string,
): Promise<{ response: string; error?: string }> {
  const port = getSavedPort();

  try {
    const http = await import("http");
    const data = JSON.stringify({ message, sender: "test_user" });

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/test",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
          },
          timeout: 30000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => (body += chunk.toString()));
          res.on("end", () => {
            try {
              const result = JSON.parse(body);
              resolve({ response: result.response || "" });
            } catch {
              resolve({ response: body });
            }
          });
        },
      );

      req.on("error", (err) =>
        reject(new Error(`Test request failed: ${err.message}`)),
      );
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Test request timed out"));
      });

      req.write(data);
      req.end();
    });
  } catch (err) {
    return { response: "", error: (err as Error).message };
  }
}

export async function getWhatsAppBotConversations(): Promise<
  ConversationSummary[]
> {
  // This reads from the conversations.db SQLite file
  // For now, return empty array — the full implementation would
  // use a SQLite reader library
  return [];
}
