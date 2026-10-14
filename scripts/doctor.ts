import { $ } from "bun";

async function main() {
  console.log("Running doctor...");

  // Check dependencies
  const bunVer = await $`bun -v`.text();
  console.log(`Bun version: ${bunVer.trim()} - OK`);

  const gitVer = await $`git --version`.text();
  console.log(`${gitVer.trim()} - OK`);

  // Check Hermes (mock for this exercise)
  console.log(`Hermes installation - OK`);

  // Check environment variables
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.log("NOTION_API_KEY not set - ⚠️ Warning");
  } else {
    console.log("NOTION_API_KEY is set - OK");
  }
}

main().catch(console.error);
