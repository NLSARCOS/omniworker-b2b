/**
 * Log rotation for desktop.log — prevents unbounded growth.
 *
 * Strategy (ported from hermes-desktop fix, 2026-06-06):
 *   - Logs grow in-place until they exceed MAX_LOG_BYTES (10 MB).
 *   - At that threshold, a cascade rotation runs:
 *       live → .1 → .2 → .3  (oldest deleted)
 *   - Pathological files (> DISCARD_MULTIPLIER × cap, e.g. boot-loop artifacts
 *     reaching 326 GB) are deleted outright instead of being relegated to .1
 *     to avoid filling the disk with the rotation itself.
 */

import { existsSync, statSync, renameSync, unlinkSync } from "fs";

const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_BACKUPS = 3;
const DISCARD_MULTIPLIER = 4; // > 40 MB → delete immediately

/**
 * Rotate `logPath` if it has grown beyond the cap.
 * Safe to call on every app launch — no-ops when the file is small enough.
 */
export function rotateLogIfNeeded(logPath: string): void {
  if (!existsSync(logPath)) return;

  let size: number;
  try {
    size = statSync(logPath).size;
  } catch {
    return; // can't stat — leave it alone
  }

  if (size <= MAX_LOG_BYTES) return;

  // Pathological: delete outright to reclaim disk immediately.
  if (size > DISCARD_MULTIPLIER * MAX_LOG_BYTES) {
    try {
      unlinkSync(logPath);
      console.log(
        `[log-rotation] Discarded pathological log (${(size / 1_073_741_824).toFixed(2)} GB): ${logPath}`,
      );
    } catch (err) {
      console.error("[log-rotation] Failed to discard log:", err);
    }
    return;
  }

  // Cascade rotation: .3 → gone, .2 → .3, .1 → .2, live → .1
  for (let i = MAX_BACKUPS; i >= 1; i--) {
    const from = i === 1 ? logPath : `${logPath}.${i - 1}`;
    const to = `${logPath}.${i}`;

    if (i === MAX_BACKUPS && existsSync(to)) {
      try {
        unlinkSync(to);
      } catch {
        /* ignore */
      }
    }

    if (existsSync(from)) {
      try {
        renameSync(from, to);
      } catch (err) {
        console.error(`[log-rotation] Failed to rotate ${from} → ${to}:`, err);
      }
    }
  }

  console.log(
    `[log-rotation] Rotated ${logPath} (was ${(size / 1_048_576).toFixed(1)} MB)`,
  );
}
