import { $ } from "bun";
import { join } from "node:path";

async function main() {
  console.log("Validating Notion mappings and LifeOSStore access...");

  const lifeosCoach = join(process.cwd(), "LifeOS", "install", "LIFEOS", "TOOLS", "LifeosCoach.ts");

  try {
    console.log("Running validation...");
    // In actual usage this will invoke `lifeos storage validate` logic
    // we use the actual CLI entrypoint to validate
    await $`bun ${lifeosCoach} storage validate`;
    console.log("Validation complete.");
  } catch (err) {
    console.error("Validation failed:", err);
    process.exit(1);
  }
}

main().catch(console.error);
