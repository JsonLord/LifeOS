import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Import from the local install directory
import { createLifeOSStore } from "../LifeOS/install/LIFEOS/STORAGE/StoreFactory.ts";
import { resolveStorageConfig } from "../LifeOS/install/LIFEOS/STORAGE/StorageConfig.ts";

async function main() {
  let hasErrors = false;
  console.log("Running doctor...");

  try {
    const bunVer = await $`bun -v`.text();
    console.log(`[OK] Bun version: ${bunVer.trim()}`);
  } catch (e) {
    console.error("[FAIL] Bun is not accessible.");
    hasErrors = true;
  }

  try {
    const gitVer = await $`git --version`.text();
    console.log(`[OK] ${gitVer.trim()}`);
  } catch (e) {
    console.error("[FAIL] Git is not accessible.");
    hasErrors = true;
  }

  const hermesHome = process.env.HERMES_HOME || join(homedir(), ".hermes");
  if (existsSync(hermesHome)) {
    console.log(`[OK] Hermes installation found at: ${hermesHome}`);
  } else {
    console.error(`[FAIL] Hermes installation not found at: ${hermesHome}`);
    hasErrors = true;
  }

  if (process.env.LIFEOS_STORAGE_PROVIDER !== "notion" && !process.env.NOTION_API_KEY) {
     console.log("[INFO] Provider is not set to 'notion', skipping Notion API check.");
  } else {
    try {
      const config = resolveStorageConfig();
      const store = createLifeOSStore(config);
      console.log(`[INFO] Checking Notion connectivity...`);

      const health = await store.healthCheck();
      if (health.ok) {
        console.log(`[OK] Notion reachable: ${health.message}`);
      } else {
        console.error(`[FAIL] Notion check failed: ${health.message}`);
        hasErrors = true;
      }
    } catch (e: any) {
      console.error(`[FAIL] Failed to initialize store for health check: ${e.message || "Configuration error"}`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error("\nDoctor found issues. Please fix them before proceeding.");
    process.exit(1);
  } else {
    console.log("\nAll checks passed. System is ready.");
  }
}

main();
