import { $ } from "bun";
import { join } from "path";

async function main() {
  console.log("Safely updating from fork's main branch...");

  try {
    // 1. Check for uncommitted changes
    const status = await $`git status --porcelain`.text();
    if (status.trim() !== "") {
      console.error("Working directory is not clean. Please commit or stash changes before upgrading.");
      process.exit(1);
    }

    // 2. Backup current state
    console.log("Creating backup before upgrade...");
    const currentSha = await $`git rev-parse HEAD`.text();
    const backupBranch = `backup-before-upgrade-${Date.now()}`;
    await $`git branch ${backupBranch} ${currentSha.trim()}`;
    console.log(`Backup branch created: ${backupBranch}`);

    // 3. Pull latest changes
    console.log("Pulling latest changes...");
    await $`git pull origin main --ff-only`;

    // 4. Re-install dependencies
    console.log("Re-installing dependencies...");
    await $`cd LifeOS/install && bun install`;

    // 5. Run Mount.ts check
    console.log("Running health check on upgraded state...");
    const mountScript = join(process.cwd(), "LifeOS", "install", "LIFEOS", "HERMES", "Mount.ts");
    await $`bun ${mountScript} --profile coach --storage-provider notion --check`;

    console.log("Upgrade successful.");
  } catch (error) {
    console.error("Error during upgrade:", error);
    console.log("To rollback, run: bun run rollback");
    process.exit(1);
  }
}

main().catch(console.error);
