import { $ } from "bun";
import { mkdir, cp } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

async function main() {
  console.log("Setting up LifeOS environment...");

  console.log("Installing dependencies...");
  await $`cd LifeOS/install && bun install`;

  console.log("Detecting Hermes...");
  const hermesHome = process.env.HERMES_HOME;
  if (!hermesHome) {
    console.warn("HERMES_HOME is not set. Assuming Hermes is installed system-wide or will be configured later.");
  } else {
    console.log(`Hermes home detected at: ${hermesHome}`);
    const coachProfileDir = join(hermesHome, "profiles", "coach");

    if (!existsSync(coachProfileDir)) {
      console.log(`Creating isolated coach profile at ${coachProfileDir}`);
      await mkdir(coachProfileDir, { recursive: true });

      const defaultConfigPath = join(hermesHome, "profiles", "default", "config.yaml");
      if (existsSync(defaultConfigPath)) {
        console.log("Copying stock config.yaml to coach profile...");
        await cp(defaultConfigPath, join(coachProfileDir, "config.yaml"));
      } else {
        console.warn("No default config.yaml found to copy. You may need to initialize the profile manually.");
      }
    } else {
      console.log("Coach profile directory already exists.");
    }
  }

  console.log("Setup complete. You may now configure your environment variables and run discovery.");
}

main().catch(console.error);
