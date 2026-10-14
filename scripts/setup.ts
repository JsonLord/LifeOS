import { $ } from "bun";
import { mkdir, cp } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

async function main() {
  try {
    console.log("Setting up LifeOS environment...");

    console.log("Installing dependencies...");
    await $`cd LifeOS/install && bun install`;

    console.log("Detecting Hermes...");
    const hermesHome = process.env.HERMES_HOME || join(homedir(), ".hermes");
    console.log(`Using Hermes home at: ${hermesHome}`);

    if (!existsSync(hermesHome)) {
      console.error(`Error: Hermes home not found at ${hermesHome}. Is Hermes installed?`);
      process.exit(1);
    }

    const coachProfileDir = join(hermesHome, "profiles", "coach");

    if (!existsSync(coachProfileDir)) {
      console.log(`Creating isolated coach profile at ${coachProfileDir}`);
      await mkdir(coachProfileDir, { recursive: true });

      const defaultConfigPath = join(hermesHome, "profiles", "default", "config.yaml");
      if (existsSync(defaultConfigPath)) {
        console.log("Copying stock config.yaml to coach profile...");
        await cp(defaultConfigPath, join(coachProfileDir, "config.yaml"));
      } else {
        console.log("Initializing blank config.yaml for coach profile...");
        await $`echo "" > ${join(coachProfileDir, "config.yaml")}`;
      }
    } else {
      console.log("Coach profile directory already exists. Existing configuration will be preserved.");
    }

    console.log("Setup complete. You may now configure your environment variables and run discovery.");
  } catch (error: any) {
    console.error("Setup failed:", error.message || error);
    process.exit(1);
  }
}

main();
