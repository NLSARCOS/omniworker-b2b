import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";

// `vi.hoisted` runs before module imports, so we can't reference imported
// `join` / `tmpdir` here — use the bare Node modules via require, which is
// the documented escape hatch for hoisted setup.
const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(os.tmpdir(), `omniworker-profiles-test-${Date.now()}`),
  };
});

// Mock installer module so OMNIWORKER_HOME points at our temp dir before
// profiles.ts evaluates the `PROFILES_DIR` constant from it.
vi.mock("../src/main/installer", () => ({
  OMNIWORKER_HOME: TEST_HOME,
  OMNIWORKER_PYTHON: "/usr/bin/python3",
  OMNIWORKER_SCRIPT: "/dev/null",
  omniworkerCliArgs: (args: string[] = []) => ["/dev/null", ...args],
  getEnhancedPath: () => process.env.PATH || "",
}));

// Import AFTER the mock so PROFILES_DIR is resolved against TEST_HOME.
import {
  createProfile,
  deleteProfile,
  listProfiles,
  setActiveProfile,
} from "../src/main/profiles";

const PROFILES_DIR = join(TEST_HOME, "profiles");

beforeEach(() => {
  mkdirSync(TEST_HOME, { recursive: true });
  mkdirSync(PROFILES_DIR, { recursive: true });
  mkdirSync(join(TEST_HOME, "omniworker-agent"), { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

describe("listProfiles", () => {
  it("includes a profile directory that has neither config.yaml nor .env (issue #19)", async () => {
    const empty = join(PROFILES_DIR, "fresh");
    mkdirSync(empty, { recursive: true });

    const profiles = await listProfiles();
    const fresh = profiles.find((p) => p.name === "fresh");
    expect(fresh).toBeDefined();
    expect(fresh?.isDefault).toBe(false);
    expect(fresh?.hasEnv).toBe(false);
  });

  it("includes a profile that has only .env", async () => {
    const dir = join(PROFILES_DIR, "env-only");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".env"), "OPENAI_API_KEY=x\n");

    const profiles = await listProfiles();
    const found = profiles.find((p) => p.name === "env-only");
    expect(found).toBeDefined();
    expect(found?.hasEnv).toBe(true);
  });

  it("includes a profile that has only config.yaml and parses model/provider", async () => {
    const dir = join(PROFILES_DIR, "config-only");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.yaml"),
      "models:\n  default: gpt-4o\n  provider: openai\n",
    );

    const profiles = await listProfiles();
    const found = profiles.find((p) => p.name === "config-only");
    expect(found).toBeDefined();
    expect(found?.model).toBe("gpt-4o");
    expect(found?.provider).toBe("openai");
  });

  it("ignores dotfiles like .DS_Store under the profiles directory", async () => {
    writeFileSync(join(PROFILES_DIR, ".DS_Store"), "");
    mkdirSync(join(PROFILES_DIR, ".hidden"), { recursive: true });

    const profiles = await listProfiles();
    const dotProfiles = profiles.filter(
      (p) => p.name.startsWith(".") || p.name === ".DS_Store",
    );
    expect(dotProfiles).toHaveLength(0);
  });

  it("ignores files (non-directories) under the profiles directory", async () => {
    writeFileSync(join(PROFILES_DIR, "stray.txt"), "stray");

    const profiles = await listProfiles();
    expect(profiles.find((p) => p.name === "stray.txt")).toBeUndefined();
  });

  it("ignores invalid profile directory names", async () => {
    mkdirSync(join(PROFILES_DIR, "valid_profile-1"), { recursive: true });
    mkdirSync(join(PROFILES_DIR, "-flag"), { recursive: true });
    mkdirSync(join(PROFILES_DIR, "has space"), { recursive: true });
    mkdirSync(join(PROFILES_DIR, "UpperCase"), { recursive: true });

    const profiles = await listProfiles();
    expect(profiles.find((p) => p.name === "valid_profile-1")).toBeDefined();
    expect(profiles.find((p) => p.name === "-flag")).toBeUndefined();
    expect(profiles.find((p) => p.name === "has space")).toBeUndefined();
    expect(profiles.find((p) => p.name === "UpperCase")).toBeUndefined();
  });

  it("returns the default profile even when ~/.omniworker/profiles/ is empty", async () => {
    const profiles = await listProfiles();
    expect(profiles.find((p) => p.isDefault)).toBeDefined();
  });

  it("marks the active profile correctly", async () => {
    const dir = join(PROFILES_DIR, "work");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(TEST_HOME, "active_profile"), "work\n");

    const profiles = await listProfiles();
    const work = profiles.find((p) => p.name === "work");
    const def = profiles.find((p) => p.isDefault);
    expect(work?.isActive).toBe(true);
    expect(def?.isActive).toBe(false);
  });

  it("rejects invalid profile names before invoking the OmniWorker CLI", () => {
    expect(createProfile("../outside", true).success).toBe(false);
    expect(createProfile("-flag", true).success).toBe(false);
    expect(deleteProfile("../outside").success).toBe(false);
    expect(() => setActiveProfile("../outside")).toThrow(
      "Profile names may contain lowercase letters",
    );
  });

  it("customizes soulPrompt and disabledToolsets options during profile creation", () => {
    const profileName = "customized-agent";
    const pHome = join(PROFILES_DIR, profileName);
    
    // Pre-create the directory and config.yaml as if the CLI created it
    mkdirSync(pHome, { recursive: true });
    const initialConfig = "agent:\n  model: gpt-4o\n  disabled_toolsets: []\n";
    writeFileSync(join(pHome, "config.yaml"), initialConfig, "utf-8");

    const soulPrompt = "Eres un agente de ventas enfocado en vender.";
    const disabledToolsets = ["terminal", "web"];

    const res = createProfile(profileName, false, {
      soulPrompt,
      disabledToolsets
    });

    expect(res.success).toBe(true);

    // Verify SOUL.md was written
    const soulFile = join(pHome, "SOUL.md");
    expect(existsSync(soulFile)).toBe(true);
    expect(readFileSync(soulFile, "utf-8")).toBe(soulPrompt);

    // Verify config.yaml was updated with disabled_toolsets
    const configFile = join(pHome, "config.yaml");
    expect(existsSync(configFile)).toBe(true);
    const updatedConfig = readFileSync(configFile, "utf-8");
    expect(updatedConfig).toContain("disabled_toolsets:");
    expect(updatedConfig).toContain("- terminal");
    expect(updatedConfig).toContain("- web");
  });
});
