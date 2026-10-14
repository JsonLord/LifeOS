import { $ } from "bun";
import { readdirSync } from "node:fs";
import { join } from "node:path";

async function main() {
  console.log("Restoring previous working installation configuration...");

  try {
    const backupDir = join(process.cwd(), "backups");

    let backups: string[] = [];
    try {
      backups = readdirSync(backupDir).filter(f => f.startsWith("backup-before-upgrade-") && f.endsWith(".tar.gz"));
    } catch(e) {
      console.error(`Could not read backup directory: ${backupDir}`);
      process.exit(1);
    }

    if (backups.length === 0) {
      console.error("No backup archives found in 'backups' directory.");
      process.exit(1);
    }

    // Pick the most recent backup based on timestamp
    backups.sort().reverse();
    const latestBackup = join(backupDir, backups[0]);

    console.log(`Rolling back using: ${latestBackup}`);

    // Extract over existing files to restore configuration state
    const result = await $`tar -xzf ${latestBackup} -C /`;
    if (result.exitCode !== 0) {
       throw new Error("Failed to extract backup archive.");
    }

    // Re-install dependencies to ensure they match the restored state if any codebase was restored
    console.log("Restoring dependencies...");
    const depsResult = await $`cd LifeOS/install && bun install`;
    if (depsResult.exitCode !== 0) {
       throw new Error("Failed to restore dependencies.");
    }

    console.log("Rollback complete. Note: Code changes from git pull were not reverted; only configurations were restored.");
  } catch (error: any) {
    console.error("Error during rollback:", error.message || error);
    process.exit(1);
  }
}

main();
