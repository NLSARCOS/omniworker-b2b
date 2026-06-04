import { join } from "path";
import {
  FLUX AGENT_HOME,
  FLUX AGENT_PYTHON,
  flux-agentCliArgs,
} from "./installer";
import { isRemoteMode, getApiUrl, getRemoteAuthHeader } from "./flux-agent";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";
import { execFile } from "child_process";

export interface DetectedPattern {
  id: string;
  canonical_prompt: string;
  pattern_type: string;
  schedule_inferred: string | null;
  confidence: number;
  occurrence_count: number;
  status: string;
  first_seen_at: number;
  last_seen_at: number;
  auto_created_job_id: string | null;
}

function runFlux AgentCommand(
  args: string[],
  profile?: string,
  timeoutMs = 15000,
): Promise<{ success: boolean; output: string; error?: string }> {
  const cliArgs = flux-agentCliArgs();
  if (profile && profile !== "default") {
    cliArgs.push("-p", profile);
  }
  cliArgs.push(...args);

  return new Promise((resolve) => {
    execFile(
      FLUX AGENT_PYTHON,
      cliArgs,
      {
        cwd: join(FLUX AGENT_HOME, "flux-agent-agent"),
        timeout: timeoutMs,
        ...HIDDEN_SUBPROCESS_OPTIONS,
      },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            success: false,
            output: stdout || "",
            error: stderr || err.message,
          });
        } else {
          resolve({ success: true, output: stdout || "" });
        }
      },
    );
  });
}

async function remoteJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function remoteFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...getRemoteAuthHeader(),
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(`${getApiUrl()}${path}`, { ...init, headers });
}

export async function listDetectedPatterns(
  profile?: string,
): Promise<DetectedPattern[]> {
  if (isRemoteMode()) {
    try {
      const res = await remoteFetch("/api/patterns");
      if (!res.ok) {
        console.error("[PATTERNS] remote list failed:", await remoteJsonError(res));
        return [];
      }
      const body = (await res.json()) as { patterns?: DetectedPattern[] };
      return body.patterns || [];
    } catch (err) {
      console.error("[PATTERNS] remote list error:", err);
      return [];
    }
  }

  const result = await runFlux AgentCommand(["patterns", "list", "--limit", "100"], profile);
  if (!result.success) {
    console.error("[PATTERNS] list failed:", result.error);
    return [];
  }
  try {
    // Parse CLI output — the Python CLI prints formatted tables, not JSON.
    // Fallback: scan stdout for simple JSON if present.
    const jsonMatch = result.output.match(/\{[\s\S]*"success"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.patterns) return parsed.patterns;
    }
  } catch {
    /* ignore parse errors */
  }
  return [];
}

export async function approvePattern(
  patternId: string,
  profile?: string,
): Promise<{ success: boolean; error?: string; job_id?: string }> {
  if (isRemoteMode()) {
    try {
      const res = await remoteFetch(`/api/patterns/${encodeURIComponent(patternId)}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        return { success: false, error: await remoteJsonError(res) };
      }
      const body = (await res.json()) as { job_id?: string };
      return { success: true, job_id: body.job_id };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  const result = await runFlux AgentCommand(
    ["patterns", "approve", patternId],
    profile,
  );
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true };
}

export async function rejectPattern(
  patternId: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  if (isRemoteMode()) {
    try {
      const res = await remoteFetch(`/api/patterns/${encodeURIComponent(patternId)}/reject`, {
        method: "POST",
      });
      if (!res.ok) {
        return { success: false, error: await remoteJsonError(res) };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  const result = await runFlux AgentCommand(
    ["patterns", "reject", patternId],
    profile,
  );
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true };
}

export async function toggleAutoLearning(
  enabled: boolean,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  // For now, this toggles a config key. In the future it could hit an API endpoint.
  const result = await runFlux AgentCommand(
    ["config", "set", "autolearning.enabled", enabled ? "true" : "false"],
    profile,
  );
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true };
}
