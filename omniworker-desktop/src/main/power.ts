import { powerSaveBlocker, powerMonitor } from "electron";

let activeBlocks = 0;
let blockerId: number | null = null;

export const PowerManager = {
  startBlocking(): void {
    activeBlocks++;
    if (activeBlocks === 1 && blockerId === null) {
      try {
        blockerId = powerSaveBlocker.start("prevent-app-suspension");
        console.log(`[PowerManager] Started power save block (ID: ${blockerId}) to prevent suspension during active agent operations.`);
      } catch (err) {
        console.error("[PowerManager] Failed to start power save blocker:", err);
      }
    }
  },

  stopBlocking(): void {
    if (activeBlocks > 0) {
      activeBlocks--;
    }
    if (activeBlocks === 0 && blockerId !== null) {
      try {
        powerSaveBlocker.stop(blockerId);
        console.log(`[PowerManager] Stopped power save block (ID: ${blockerId}). App suspension allowed.`);
      } catch (err) {
        console.error("[PowerManager] Failed to stop power save blocker:", err);
      }
      blockerId = null;
    }
  }
};

export function setupPowerMonitor(): void {
  powerMonitor.on("resume", () => {
    console.log("[PowerManager] System resumed from sleep. Triggering cron catch-up tick...");
    // Trigger catch-up tick for cronjobs dynamically to avoid circular dependencies
    setTimeout(async () => {
      try {
        const { runCronCommand } = require("./cronjobs");
        const res = await runCronCommand(["tick"]);
        if (res.success) {
          console.log("[PowerManager] Cron catch-up tick completed successfully.");
        } else {
          console.warn("[PowerManager] Cron catch-up tick completed with warnings:", res.error);
        }
      } catch (err) {
        console.error("[PowerManager] Failed to run cron catch-up tick on resume:", err);
      }
    }, 2000); // 2s delay to let the network/OS/database interfaces stabilize after wake-up
  });
}
