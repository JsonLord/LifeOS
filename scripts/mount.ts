import { $ } from "bun";
import { join } from "node:path";

async function main() {
  console.log("Connecting LifeOS to existing Hermes installation...");

  const validateScript = join(process.cwd(), "scripts", "validate.ts");
  try {
    console.log("Validating before mounting...");
    await $`bun ${validateScript}`;
  } catch (error: any) {
    console.error("Mounting refused: validation failed.");
    process.exit(1);
  }

  const mountScript = join(process.cwd(), "LifeOS", "install", "LIFEOS", "HERMES", "Mount.ts");

  try {
    console.log("Mounting coach profile...");
    const result = await $`bun ${mountScript} --profile coach --storage-provider notion`;

    if (result.exitCode !== 0) {
       console.error("Mount script exited with non-zero code.");
       process.exit(result.exitCode);
    }
    console.log("Coach profile mounted successfully.");
  } catch (error: any) {
    console.error("Error mounting coach profile:", error.message || error);
    process.exit(1);
  }
}

main();
