import { $ } from "bun";
import { join } from "node:path";

async function main() {
  console.log("Connecting LifeOS to existing Hermes installation...");
  const mountScript = join(process.cwd(), "LifeOS", "install", "LIFEOS", "HERMES", "Mount.ts");

  try {
    await $`bun ${mountScript} --profile coach --storage-provider notion`;
    console.log("Coach profile mounted successfully.");
  } catch (error) {
    console.error("Error mounting coach profile:", error);
    process.exit(1);
  }
}

main().catch(console.error);
