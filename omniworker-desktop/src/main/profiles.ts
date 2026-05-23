import { execFileSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { promises as fs } from "fs";
import { existsSync, readFileSync } from "fs";
import {
  OMNIWORKER_HOME,
  OMNIWORKER_PYTHON,
  omniworkerCliArgs,
  getEnhancedPath,
} from "./installer";
import {
  isValidNamedProfileName,
  isValidProfileName,
  PROFILE_NAME_ERROR,
  getExecErrorMessage,
  profileHome,
  safeWriteFile,
} from "./utils";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";

const PROFILES_DIR = join(OMNIWORKER_HOME, "profiles");

export interface ProfileInfo {
  name: string;
  path: string;
  isDefault: boolean;
  isActive: boolean;
  model: string;
  provider: string;
  hasEnv: boolean;
  hasSoul: boolean;
  skillCount: number;
  gatewayRunning: boolean;
}

function updateDisabledToolsetsInConfig(content: string, disabledToolsets: string[]): string {
  let block = "";
  if (disabledToolsets.length === 0) {
    block = "  disabled_toolsets: []";
  } else {
    block = "  disabled_toolsets:\n" + disabledToolsets.map(ts => `    - ${ts}`).join("\n");
  }

  const agentIndex = content.search(/^agent:\s*$/m);
  if (agentIndex === -1) {
    return content + `\nagent:\n${block}\n`;
  }

  const lines = content.split("\n");
  let agentLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^agent:\s*$/.test(lines[i])) {
      agentLineIndex = i;
      break;
    }
  }

  if (agentLineIndex === -1) return content;

  let agentEndIndex = lines.length;
  let disabledToolsetsStartLineIndex = -1;
  let disabledToolsetsEndLineIndex = -1;

  for (let i = agentLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("#")) {
      agentEndIndex = i;
      break;
    }

    if (/^\s*disabled_toolsets\s*:/.test(line)) {
      disabledToolsetsStartLineIndex = i;
    }
  }

  if (disabledToolsetsStartLineIndex !== -1) {
    disabledToolsetsEndLineIndex = disabledToolsetsStartLineIndex + 1;
    while (disabledToolsetsEndLineIndex < agentEndIndex) {
      const line = lines[disabledToolsetsEndLineIndex];
      if (line.trim() === "" || line.startsWith("#")) {
        disabledToolsetsEndLineIndex++;
        continue;
      }
      if (/^ {2}[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(line)) {
        break;
      }
      if (!line.startsWith(" ")) {
        break;
      }
      disabledToolsetsEndLineIndex++;
    }

    lines.splice(
      disabledToolsetsStartLineIndex,
      disabledToolsetsEndLineIndex - disabledToolsetsStartLineIndex,
      block
    );
  } else {
    lines.splice(agentLineIndex + 1, 0, block);
  }

  return lines.join("\n");
}

async function readProfileConfig(profilePath: string): Promise<{
  model: string;
  provider: string;
}> {
  const configFile = join(profilePath, "config.yaml");
  try {
    const content = await fs.readFile(configFile, "utf-8");
    const modelMatch = content.match(/^\s*default:\s*["']?([^"'\n#]+)["']?/m);
    const providerMatch = content.match(
      /^\s*provider:\s*["']?([^"'\n#]+)["']?/m,
    );
    const model = modelMatch ? modelMatch[1].trim() : "";
    const provider = providerMatch ? providerMatch[1].trim() : "";
    return {
      model: model || "omniworker",
      provider: provider || "custom",
    };
  } catch {
    return { model: "omniworker", provider: "custom" };
  }
}

async function countSkills(profilePath: string): Promise<number> {
  const skillsDir = join(profilePath, "skills");
  try {
    const dirs = await fs.readdir(skillsDir);
    let count = 0;
    for (const d of dirs) {
      const sub = join(skillsDir, d);
      const stat = await fs.stat(sub);
      if (stat.isDirectory()) {
        const inner = await fs.readdir(sub);
        for (const f of inner) {
          try {
            await fs.access(join(sub, f, "SKILL.md"));
            count++;
          } catch {
            // not a skill
          }
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function isGatewayRunning(profilePath: string): Promise<boolean> {
  const pidFile = join(profilePath, "gateway.pid");
  try {
    const raw = await fs.readFile(pidFile, "utf-8");
    const pid = parseInt(raw.trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getActiveProfileName(): Promise<string> {
  const activeFile = join(OMNIWORKER_HOME, "active_profile");
  try {
    const name = await fs.readFile(activeFile, "utf-8");
    return name.trim() || "default";
  } catch {
    return "default";
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function listProfiles(): Promise<ProfileInfo[]> {
  const activeName = await getActiveProfileName();
  const profiles: ProfileInfo[] = [];

  // Default profile is OMNIWORKER_HOME itself
  const [
    defaultConfig,
    defaultHasEnv,
    defaultHasSoul,
    defaultSkills,
    defaultGw,
  ] = await Promise.all([
    readProfileConfig(OMNIWORKER_HOME),
    fileExists(join(OMNIWORKER_HOME, ".env")),
    fileExists(join(OMNIWORKER_HOME, "SOUL.md")),
    countSkills(OMNIWORKER_HOME),
    isGatewayRunning(OMNIWORKER_HOME),
  ]);

  profiles.push({
    name: "default",
    path: OMNIWORKER_HOME,
    isDefault: true,
    isActive: activeName === "default",
    model: defaultConfig.model,
    provider: defaultConfig.provider,
    hasEnv: defaultHasEnv,
    hasSoul: defaultHasSoul,
    skillCount: defaultSkills,
    gatewayRunning: defaultGw,
  });

  // Named profiles under ~/.omniworker/profiles/
  if (existsSync(PROFILES_DIR)) {
    try {
      const dirs = await fs.readdir(PROFILES_DIR);
      const profilePromises = dirs.map(async (name) => {
        // Skip dotfiles like .DS_Store so they don't get mistaken for profiles.
        if (name.startsWith(".")) return null;
        if (!isValidNamedProfileName(name)) return null;

        const profilePath = join(PROFILES_DIR, name);
        const stat = await fs.stat(profilePath);
        if (!stat.isDirectory()) return null;

        // Any subdirectory of ~/.omniworker/profiles/ is treated as a profile.
        // We deliberately do NOT require config.yaml or .env to exist —
        // a freshly created profile may have neither yet, and filtering on
        // them silently hides it from the UI (issue #19).
        const [config, hasEnvFile, hasSoul, skillCount, gwRunning] =
          await Promise.all([
            readProfileConfig(profilePath),
            fileExists(join(profilePath, ".env")),
            fileExists(join(profilePath, "SOUL.md")),
            countSkills(profilePath),
            isGatewayRunning(profilePath),
          ]);

        return {
          name,
          path: profilePath,
          isDefault: false,
          isActive: activeName === name,
          model: config.model,
          provider: config.provider,
          hasEnv: hasEnvFile,
          hasSoul: hasSoul,
          skillCount,
          gatewayRunning: gwRunning,
        } as ProfileInfo;
      });

      const resolved = await Promise.all(profilePromises);
      for (const p of resolved) {
        if (p) profiles.push(p);
      }
    } catch {
      // ignore
    }
  }

  return profiles;
}

function copyModelBlock(srcConfigPath: string, dstConfigPath: string): void {
  try {
    let modelBlock = "";
    if (existsSync(srcConfigPath)) {
      const srcContent = readFileSync(srcConfigPath, "utf-8");
      const lines = srcContent.split("\n");
      let inModel = false;
      const modelLines: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^model:\s*$/.test(line)) {
          inModel = true;
          modelLines.push(line);
          continue;
        }
        if (inModel) {
          if (line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("#")) {
            break;
          }
          modelLines.push(line);
        }
      }
      if (modelLines.length > 0) {
        modelBlock = modelLines.join("\n");
      }
    }

    if (!modelBlock) {
      modelBlock = "model:\n  default: \"omniworker\"\n  provider: \"custom\"";
    }
    
    let dstContent = "";
    if (existsSync(dstConfigPath)) {
      dstContent = readFileSync(dstConfigPath, "utf-8");
    }
    
    const dstModelIndex = dstContent.search(/^model:\s*$/m);
    if (dstModelIndex !== -1) {
      const dstLines = dstContent.split("\n");
      let dstModelLineIndex = -1;
      for (let i = 0; i < dstLines.length; i++) {
        if (/^model:\s*$/.test(dstLines[i])) {
          dstModelLineIndex = i;
          break;
        }
      }
      if (dstModelLineIndex !== -1) {
        let dstModelEndLineIndex = dstLines.length;
        for (let i = dstModelLineIndex + 1; i < dstLines.length; i++) {
          const line = dstLines[i];
          if (line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("#")) {
            dstModelEndLineIndex = i;
            break;
          }
        }
        dstLines.splice(dstModelLineIndex, dstModelEndLineIndex - dstModelLineIndex, modelBlock);
        dstContent = dstLines.join("\n");
      }
    } else {
      dstContent = modelBlock + "\n\n" + dstContent;
    }
    
    safeWriteFile(dstConfigPath, dstContent);
  } catch (e) {
    console.error("Failed to copy model block to new profile:", e);
  }
}

export function createProfile(
  name: string,
  clone: boolean,
  options?: { soulPrompt?: string; disabledToolsets?: string[] }
): { success: boolean; error?: string } {
  if (name === "default") {
    return { success: false, error: "Cannot create the default profile" };
  }
  if (!isValidNamedProfileName(name)) {
    return { success: false, error: PROFILE_NAME_ERROR };
  }

  try {
    const args = clone
      ? ["profile", "create", name, "--clone"]
      : ["profile", "create", name];
    execFileSync(OMNIWORKER_PYTHON, omniworkerCliArgs(args), {
      cwd: join(OMNIWORKER_HOME, "omniworker-agent"),
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
        HOME: homedir(),
        OMNIWORKER_HOME,
      },
      stdio: "pipe",
      timeout: 90000, // Safe generous timeout for skill seeding
      ...HIDDEN_SUBPROCESS_OPTIONS,
    });

    const pHome = profileHome(name);
    const configFile = join(pHome, "config.yaml");
    const defaultConfigFile = join(OMNIWORKER_HOME, "config.yaml");
    copyModelBlock(defaultConfigFile, configFile);

    if (options) {
      if (options.soulPrompt) {
        const soulFile = join(pHome, "SOUL.md");
        safeWriteFile(soulFile, options.soulPrompt);
      }
      if (options.disabledToolsets) {
        if (existsSync(configFile)) {
          try {
            const content = readFileSync(configFile, "utf-8");
            const updated = updateDisabledToolsetsInConfig(content, options.disabledToolsets);
            safeWriteFile(configFile, updated);
          } catch (e) {
            console.error("Failed to update config.yaml with disabled toolsets:", e);
          }
        }
      }
    }

    return { success: true };
  } catch (err) {
    const msg = getExecErrorMessage(err);
    return { success: false, error: msg };
  }
}

export function deleteProfile(name: string): {
  success: boolean;
  error?: string;
} {
  if (name === "default")
    return { success: false, error: "Cannot delete the default profile" };
  if (!isValidNamedProfileName(name)) {
    return { success: false, error: PROFILE_NAME_ERROR };
  }

  try {
    execFileSync(
      OMNIWORKER_PYTHON,
      omniworkerCliArgs(["profile", "delete", name, "--yes"]),
      {
        cwd: join(OMNIWORKER_HOME, "omniworker-agent"),
        env: {
          ...process.env,
          PATH: getEnhancedPath(),
          HOME: homedir(),
          OMNIWORKER_HOME,
        },
        stdio: "pipe",
        timeout: 30000, // Robust timeout for service cleanup
        ...HIDDEN_SUBPROCESS_OPTIONS,
      },
    );
    return { success: true };
  } catch (err) {
    const msg = getExecErrorMessage(err);
    return { success: false, error: msg };
  }
}

export function setActiveProfile(name: string): void {
  if (!isValidProfileName(name)) {
    throw new Error(PROFILE_NAME_ERROR);
  }

  try {
    execFileSync(
      OMNIWORKER_PYTHON,
      omniworkerCliArgs(["profile", "use", name]),
      {
        cwd: join(OMNIWORKER_HOME, "omniworker-agent"),
        env: {
          ...process.env,
          PATH: getEnhancedPath(),
          HOME: homedir(),
          OMNIWORKER_HOME,
        },
        stdio: "pipe",
        timeout: 20000, // Robust timeout for switching active profiles
        ...HIDDEN_SUBPROCESS_OPTIONS,
      },
    );
  } catch {
    // ignore
  }
}

export interface OnboardingData {
  userName: string;
  language: string;
  role: "developer" | "gateway" | "executive" | "creative";
  tone: "direct" | "collaborative" | "academic";
  proactivity: boolean;
  engine: "local" | "cloud";
}

export function saveOnboardingData(data: OnboardingData): { success: boolean; error?: string } {
  try {
    const roleNames: Record<string, string> = {
      developer: "Software Engineer",
      gateway: "Gateway Automator",
      executive: "Executive & Data Assistant",
      creative: "General Creative Co-Pilot"
    };

    const toneNames: Record<string, string> = {
      direct: "Direct & Raw (No-Fluff)",
      collaborative: "Collaborative Pair-Programmer",
      academic: "Academic Educator"
    };

    const enabledToolsetsMap: Record<string, string> = {
      developer: "terminal, file, web, skills, todo",
      gateway: "smtp_client, terminal, file, web, skills, cronjob",
      executive: "smtp_client, file, web, browser, todo",
      creative: "file, web, skills, todo, tts"
    };

    const roleName = roleNames[data.role] || "General Co-Pilot";
    const toneName = toneNames[data.tone] || "Collaborative Pair-Programmer";
    const enabledToolsets = enabledToolsetsMap[data.role] || "file, web, skills, todo";
    const proactivityText = data.proactivity ? "Proactive" : "Reactive";

    const soulContent = `# OmniWorker Soul Configuration

## 👤 User Identity
- **Owner Name:** ${data.userName}
- **Preferred Language:** ${data.language}
- **Preferred Form of Address:** Direct, addressing the user as "${data.userName}".

## 🎯 Primary Focus & Role
- **Active Specialty:** ${roleName}
- **Primary Objective:** Deliver high-quality output tailored for ${roleName} workflows.
- **Enabled Core Competencies:** ${enabledToolsets}

## 🎭 Persona & Communication Rules
- **Tone Profile:** ${toneName}
- **Behavior Level:** ${proactivityText}

### Explicit Constraints
1. **Response Style:**
   - If Tone Profile is "Direct & Raw (No-Fluff)": Never use sycophantic preambles like "Sure, I can help with that!" or "Perfect, let me do that." Lead directly with the code, edit, or answer. Keep explanations post-logic and minimal.
   - If Tone Profile is "Collaborative Pair-Programmer": Propose design approaches and wait for approval before doing multi-file changes.
   - If Tone Profile is "Academic Educator": Provide high-level context, trace dependencies, and explain the theoretical mechanics of the code.
2. **Proactivity Control:**
   - If Behavior is "Proactive": Silently check code files for potential security, performance, or typing flaws and add inline recommendations.
   - If Behavior is "Reactive": Address the request literally without adding speculative features or refactoring unrelated lines.
3. **Locale:** All responses, formatting, and markdown texts must be outputted in ${data.language}, keeping variable names and strict code comments in English.
`;

    const defaultSoulPath = join(OMNIWORKER_HOME, "SOUL.md");
    safeWriteFile(defaultSoulPath, soulContent);

    const defaultConfigPath = join(OMNIWORKER_HOME, "config.yaml");
    if (existsSync(defaultConfigPath)) {
      let configContent = readFileSync(defaultConfigPath, "utf-8");

      const disabledToolsetsMap: Record<string, string[]> = {
        developer: ["smtp_client", "browser", "tts", "cronjob"],
        gateway: ["browser", "tts", "todo"],
        executive: ["terminal", "skills", "tts", "cronjob"],
        creative: ["smtp_client", "terminal", "browser", "cronjob"]
      };
      const disabledList = disabledToolsetsMap[data.role] || [];

      configContent = updateDisabledToolsetsInConfig(configContent, disabledList);
      safeWriteFile(defaultConfigPath, configContent);
    }

    const { setOnboardingCompleted } = require("./config");
    setOnboardingCompleted(true);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

