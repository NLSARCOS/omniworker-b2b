/**
 * OmniWorker Desktop — Full backup/restore module.
 *
 * Creates/reads `.tar.gz` archives containing ALL user data:
 * config, env, persona (SOUL.md), memory, skills, sessions,
 * kanban, cron jobs, desktop settings, models, and session cache.
 *
 * All operations run in the Electron main process — no Python CLI needed.
 */
import { join, relative } from "path";
import {
  existsSync,
  statSync,
  readdirSync,
  createWriteStream,
  mkdirSync,
  rmSync,
  copyFileSync,
  readFileSync,
} from "fs";
import archiver from "archiver";
import { extract } from "tar";
import { profileHome } from "./utils";
import { OMNIWORKER_HOME } from "./installer";

// ─── Types ───────────────────────────────────────────────────────

export interface BackupItem {
  category: string;
  label: string;
  /** Path relative to the profile home directory */
  relPath: string;
  exists: boolean;
  size: number;
}

export interface BackupInventory {
  profileName: string;
  files: BackupItem[];
  totalSize: number;
  sessionCount: number;
  kanbanTaskCount: number;
}

export interface BackupManifest {
  version: 1;
  appVersion: string;
  createdAt: string;
  profileName: string;
  includesSessions: boolean;
  includesKanban: boolean;
  items: Array<{ path: string; size: number; exists: boolean }>;
  totalSize: number;
}

export interface BackupProgress {
  phase: "scanning" | "compressing" | "extracting" | "copying";
  currentFile: string;
  percent: number;
}

// ─── Data categories to back up ──────────────────────────────────

const BACKUP_CATEGORIES: Array<{
  category: string;
  label: string;
  /** Relative path(s) from profileHome */
  paths: string[];
  /** Path type: file or directory */
  type: "file" | "dir";
  /** Included by default? */
  defaultInclude: boolean;
}> = [
  { category: "Config", label: "Configuration (config.yaml)", paths: ["config.yaml"], type: "file", defaultInclude: true },
  { category: "Config", label: "Environment Variables (.env)", paths: [".env"], type: "file", defaultInclude: true },
  { category: "Persona", label: "Agent Persona (SOUL.md)", paths: ["SOUL.md"], type: "file", defaultInclude: true },
  { category: "Memory", label: "Agent Memory", paths: ["memories/MEMORY.md", "memories/USER.md"], type: "file", defaultInclude: true },
  { category: "Skills", label: "Learned Skills", paths: ["skills"], type: "dir", defaultInclude: true },
  { category: "Cron", label: "Scheduled Jobs", paths: ["cron/jobs.json"], type: "file", defaultInclude: true },
  { category: "Sessions", label: "Chat History (state.db)", paths: ["state.db"], type: "file", defaultInclude: false },
  { category: "Kanban", label: "Task Board (kanban.db)", paths: ["kanban.db"], type: "file", defaultInclude: false },
];

const DESKTOP_FILES: Array<{ label: string; paths: string[] }> = [
  { label: "Desktop Settings", paths: ["desktop.json"] },
  { label: "Custom Models", paths: ["models.json"] },
  { label: "Session Cache", paths: ["desktop/sessions.json"] },
];

// ─── Scan ────────────────────────────────────────────────────────

export function scanBackupData(
  profile?: string,
  options?: { includeSessions?: boolean; includeKanban?: boolean },
): BackupInventory {
  const home = profileHome(profile);
  const name = profile || "default";
  const files: BackupItem[] = [];
  let totalSize = 0;

  for (const cat of BACKUP_CATEGORIES) {
    // Skip optional categories if not requested
    if (cat.category === "Sessions" && !options?.includeSessions) continue;
    if (cat.category === "Kanban" && !options?.includeKanban) continue;

    for (const rel of cat.paths) {
      const full = join(home, rel);
      const info = scanPath(full);
      files.push({
        category: cat.category,
        label: cat.label,
        relPath: rel,
        exists: info.exists,
        size: info.size,
      });
      totalSize += info.size;
    }
  }

  // Desktop-specific files
  for (const df of DESKTOP_FILES) {
    for (const rel of df.paths) {
      const full = join(home, rel);
      const info = scanPath(full);
      files.push({
        category: "Desktop",
        label: df.label,
        relPath: rel,
        exists: info.exists,
        size: info.size,
      });
      totalSize += info.size;
    }
  }

  // Count sessions & kanban tasks (quick sqlite read)
  let sessionCount = 0;
  let kanbanTaskCount = 0;
  try {
    const stateDb = join(home, "state.db");
    if (existsSync(stateDb)) {
      const Database = require("better-sqlite3");
      const db = new Database(stateDb, { readonly: true });
      sessionCount = (db.prepare("SELECT COUNT(*) as c FROM sessions").get() as any)?.c || 0;
      db.close();
    }
  } catch { /* ignore */ }
  try {
    const kanbanDb = join(home, "kanban.db");
    if (existsSync(kanbanDb)) {
      const Database = require("better-sqlite3");
      const db = new Database(kanbanDb, { readonly: true });
      kanbanTaskCount = (db.prepare("SELECT COUNT(*) as c FROM tasks").get() as any)?.c || 0;
      db.close();
    }
  } catch { /* ignore */ }

  return { profileName: name, files, totalSize, sessionCount, kanbanTaskCount };
}

function scanPath(fullPath: string): { exists: boolean; size: number } {
  if (!existsSync(fullPath)) return { exists: false, size: 0 };
  try {
    const s = statSync(fullPath);
    if (s.isFile()) return { exists: true, size: s.size };
    if (s.isDirectory()) {
      let size = 0;
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, entry.name);
          if (entry.isFile()) size += statSync(p).size;
          else if (entry.isDirectory()) walk(p);
        }
      };
      walk(fullPath);
      return { exists: true, size };
    }
  } catch { /* ignore */ }
  return { exists: false, size: 0 };
}

// ─── Create Backup ───────────────────────────────────────────────

export async function createBackup(
  destPath: string,
  profile?: string,
  options?: { includeSessions?: boolean; includeKanban?: boolean },
  onProgress?: (p: BackupProgress) => void,
): Promise<{ success: boolean; path?: string; error?: string; size?: number }> {
  const home = profileHome(profile);
  const name = profile || "default";
  const inventory = scanBackupData(profile, options);

  // Collect files to archive
  const toArchive: Array<{ src: string; dest: string }> = [];

  for (const item of inventory.files) {
    if (!item.exists) continue;
    const src = join(home, item.relPath);
    if (item.category === "Skills" && existsSync(src) && statSync(src).isDirectory()) {
      // Walk skills directory
      const walk = (dir: string, prefix: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, entry.name);
          const d = `profile/${prefix}${entry.name}`;
          if (entry.isFile()) toArchive.push({ src: p, dest: d });
          else if (entry.isDirectory()) walk(p, `${prefix}${entry.name}/`);
        }
      };
      walk(src, "skills/");
    } else if (existsSync(src) && statSync(src).isFile()) {
      toArchive.push({ src, dest: `profile/${item.relPath}` });
    }
  }

  // active_profile
  const activeProfileFile = join(OMNIWORKER_HOME, "active_profile");
  if (existsSync(activeProfileFile)) {
    toArchive.push({ src: activeProfileFile, dest: "active_profile" });
  }

  // Build manifest
  const manifest: BackupManifest = {
    version: 1,
    appVersion: (global as any).__omniworker_app_version || "0.0.0",
    createdAt: new Date().toISOString(),
    profileName: name,
    includesSessions: !!options?.includeSessions,
    includesKanban: !!options?.includeKanban,
    items: inventory.files.map((f) => ({ path: f.relPath, size: f.size, exists: f.exists })),
    totalSize: inventory.totalSize,
  };

  // Create tar.gz
  return new Promise((resolve) => {
    try {
      const output = createWriteStream(destPath);
      const archive = archiver("tar", { gzip: true, gzipOptions: { level: 6 } });

      output.on("close", () => {
        const size = archive.pointer();
        onProgress?.({ phase: "compressing", currentFile: "", percent: 100 });
        resolve({ success: true, path: destPath, size });
      });

      archive.on("error", (err: Error) => {
        resolve({ success: false, error: err.message });
      });

      archive.on("entry", (entry: any) => {
        onProgress?.({
          phase: "compressing",
          currentFile: entry.name,
          percent: Math.round((archive.pointer() / (inventory.totalSize || 1)) * 100),
        });
      });

      archive.pipe(output);

      // Add manifest
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

      // Add data files
      for (const item of toArchive) {
        if (existsSync(item.src)) {
          archive.file(item.src, { name: item.dest });
        }
      }

      archive.finalize();
    } catch (err: any) {
      resolve({ success: false, error: err.message || "Unknown error creating backup" });
    }
  });
}

// ─── Read Manifest ───────────────────────────────────────────────

export async function readBackupManifest(
  archivePath: string,
): Promise<{ manifest: BackupManifest | null; error?: string }> {
  if (!existsSync(archivePath)) {
    return { manifest: null, error: "File not found" };
  }

  try {
    // Extract only manifest.json to a temp buffer using tar
    const tmpDir = join(OMNIWORKER_HOME, ".tmp", `manifest-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    await extract({ cwd: tmpDir, file: archivePath, gzip: true });

    const manifestPath = join(tmpDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      // Try finding it in subdirectory
      const dirs = readdirSync(tmpDir);
      const sub = dirs.find((d) =>
        existsSync(join(tmpDir, d, "manifest.json")),
      );
      if (sub) {
        const data = JSON.parse(readFileSync(join(tmpDir, sub, "manifest.json"), "utf-8"));
        rmSync(tmpDir, { recursive: true, force: true });
        return { manifest: data };
      }
      rmSync(tmpDir, { recursive: true, force: true });
      return { manifest: null, error: "No manifest.json found in archive" };
    }

    const data = JSON.parse(readFileSync(manifestPath, "utf-8"));
    rmSync(tmpDir, { recursive: true, force: true });
    return { manifest: data };
  } catch (err: any) {
    return { manifest: null, error: `Failed to read backup: ${err.message}` };
  }
}

// ─── Restore Backup ──────────────────────────────────────────────

export async function restoreBackup(
  archivePath: string,
  profile?: string,
  options?: { includeSessions?: boolean; includeKanban?: boolean; overwrite?: boolean },
  onProgress?: (p: BackupProgress) => void,
): Promise<{ success: boolean; error?: string; restoredItems: string[] }> {
  const home = profileHome(profile);
  const tmpDir = join(OMNIWORKER_HOME, ".tmp", `restore-${Date.now()}`);

  try {
    // Extract full archive to temp
    mkdirSync(tmpDir, { recursive: true });
    onProgress?.({ phase: "extracting", currentFile: archivePath, percent: 10 });

    await extract({ cwd: tmpDir, file: archivePath, gzip: true });

    // Find the extracted root (may have a wrapper directory)
    let extractRoot = tmpDir;
    const entries = readdirSync(tmpDir);
    if (entries.length === 1 && statSync(join(tmpDir, entries[0])).isDirectory()) {
      extractRoot = join(tmpDir, entries[0]);
    }

    // Validate manifest
    const manifestPath = join(extractRoot, "manifest.json");
    if (!existsSync(manifestPath)) {
      return { success: false, error: "Invalid backup: no manifest.json", restoredItems: [] };
    }

    // Copy profile files
    const profileDir = join(extractRoot, "profile");
    const restoredItems: string[] = [];

    if (existsSync(profileDir)) {
      const walkAndCopy = (srcDir: string, destDir: string) => {
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
          const src = join(srcDir, entry.name);
          const dest = join(destDir, entry.name);
          const relPath = relative(profileDir, src);

          // Skip optional items if not requested
          if ((relPath === "state.db") && !options?.includeSessions) continue;
          if ((relPath === "kanban.db") && !options?.includeKanban) continue;

          if (entry.isFile()) {
            if (existsSync(dest) && !options?.overwrite) {
              // Don't overwrite existing files unless explicitly requested
            } else {
              mkdirSync(destDir, { recursive: true });
              copyFileSync(src, dest);
              restoredItems.push(relPath);
            }
            onProgress?.({
              phase: "copying",
              currentFile: relPath,
              percent: 50 + Math.round((restoredItems.length / 20) * 50),
            });
          } else if (entry.isDirectory()) {
            walkAndCopy(src, dest);
          }
        }
      };
      walkAndCopy(profileDir, home);
    }

    // Restore active_profile
    const activeProfileSrc = join(extractRoot, "active_profile");
    if (existsSync(activeProfileSrc)) {
      copyFileSync(activeProfileSrc, join(OMNIWORKER_HOME, "active_profile"));
    }

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });

    onProgress?.({ phase: "copying", currentFile: "", percent: 100 });
    return { success: true, restoredItems };
  } catch (err: any) {
    // Cleanup on error
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return { success: false, error: err.message || "Restore failed", restoredItems: [] };
  }
}
