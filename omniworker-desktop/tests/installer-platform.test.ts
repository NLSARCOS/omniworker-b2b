import { describe, expect, it } from "vitest";
import { delimiter } from "path";
import {
  getEnhancedPath,
  omniworkerCliArgs,
  OMNIWORKER_PYTHON,
  OMNIWORKER_SCRIPT,
} from "../src/main/installer";

describe("installer platform wiring", () => {
  it("uses the platform path delimiter in the enhanced PATH", () => {
    const enhancedPath = getEnhancedPath();

    expect(enhancedPath).toContain(process.env.PATH || "");
    expect(enhancedPath.split(delimiter).length).toBeGreaterThan(1);
  });

  it("builds platform-specific OmniWorker CLI invocation args", () => {
    const args = omniworkerCliArgs(["--version"]);

    if (process.platform === "win32") {
      expect(args).toEqual(["-m", "omniworker_cli.main", "--version"]);
      expect(OMNIWORKER_PYTHON).toMatch(/venv[\\/]Scripts[\\/]python\.exe$/);
      expect(OMNIWORKER_SCRIPT).toMatch(/venv[\\/]Scripts[\\/]omniworker\.exe$/);
      return;
    }

    expect(args).toEqual([OMNIWORKER_SCRIPT, "--version"]);
    expect(OMNIWORKER_PYTHON).toMatch(/venv[\\/]bin[\\/]python$/);
  });
});
