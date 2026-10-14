import { $ } from "bun";
import { join } from "node:path";

async function main() {
  console.log("Validating Notion mappings and LifeOSStore access...");

  const lifeosCoach = join(process.cwd(), "LifeOS", "install", "LIFEOS", "TOOLS", "LifeosCoach.ts");

  try {
    console.log("Running validation...");
    const result = await $`bun ${lifeosCoach} storage validate`;

    if (result.exitCode !== 0) {
       console.error("Validation failed with non-zero exit code.");
       process.exit(result.exitCode);
    }

    console.log("Validation complete.");
  } catch (err: any) {
    console.error("Validation failed:", err.message || err);
    process.exit(1);
  }
}

main();
