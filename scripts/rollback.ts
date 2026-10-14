import { $ } from "bun";

async function main() {
  console.log("Restoring previous working installation...");

  try {
    // List backup branches
    const branchesOutput = await $`git branch --list 'backup-before-upgrade-*'`.text();
    const branches = branchesOutput.split('\n').map(b => b.trim().replace('* ', '')).filter(b => b !== '');

    if (branches.length === 0) {
      console.log("No backup branches found.");
      process.exit(1);
    }

    // Pick the most recent backup
    branches.sort().reverse();
    const latestBackup = branches[0];

    console.log(`Rolling back to: ${latestBackup}`);

    // Reset to backup state
    await $`git reset --hard ${latestBackup}`;

    // Re-install dependencies to ensure they match the code state
    console.log("Restoring dependencies...");
    await $`cd LifeOS/install && bun install`;

    console.log("Rollback complete.");
  } catch (error) {
    console.error("Error during rollback:", error);
    process.exit(1);
  }
}

main().catch(console.error);
