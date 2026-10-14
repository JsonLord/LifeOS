import { $ } from "bun";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

async function main() {
  console.log("Safely updating from fork's main branch...");

  try {
    const backupDir = join(process.cwd(), "backups");
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = Date.now();
    const backupFile = join(backupDir, `backup-before-upgrade-${timestamp}.tar.gz`);

    console.log("Creating backup before upgrade...");
    const configDir = join(process.cwd(), "config");
    const hermesHome = process.env.HERMES_HOME || join(homedir(), ".hermes");
    const profilesDir = join(hermesHome, "profiles");

    const pathsToBackup = [];
    if (existsSync(configDir)) pathsToBackup.push(configDir);
    if (existsSync(profilesDir)) pathsToBackup.push(profilesDir);

    if (pathsToBackup.length > 0) {
      const result = await $`tar -czf ${backupFile} ${pathsToBackup.join(" ")}`;
      if (result.exitCode !== 0) {
        throw new Error("Failed to create backup archive.");
      }
      console.log(`Backup created at: ${backupFile}`);
    } else {
      console.log("No config or profiles found to backup.");
    }

    // 3. Pull latest changes safely
    console.log("Pulling latest changes...");
    const pullResult = await $`git pull origin main --ff-only`;
    if (pullResult.exitCode !== 0) {
      throw new Error("Failed to pull latest changes (fast-forward only). Ensure working tree is clean.");
    }

    // 4. Re-install dependencies
    console.log("Re-installing dependencies...");
    const depsResult = await $`cd LifeOS/install && bun install`;
    if (depsResult.exitCode !== 0) {
      throw new Error("Failed to install dependencies.");
    }

    // 5. Run Mount.ts check
    console.log("Running health check on upgraded state...");
    const mountScript = join(process.cwd(), "LifeOS", "install", "LIFEOS", "HERMES", "Mount.ts");
    const checkResult = await $`bun ${mountScript} --profile coach --storage-provider notion --check`;
    if (checkResult.exitCode !== 0) {
       throw new Error("Health check failed on upgraded state.");
    }

    console.log("Upgrade successful.");
  } catch (error: any) {
    console.error("Error during upgrade:", error.message || error);
    console.log("To rollback, run: bun run rollback");
    process.exit(1);
  }
}

main();
