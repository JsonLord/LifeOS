import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { join } from "node:path";

describe("Functional Script Tests", () => {
  beforeEach(() => {
    // Reset env vars before each test to prevent leaking state
    delete process.env.HERMES_HOME;
    delete process.env.NOTION_API_KEY;
    delete process.env.LIFEOS_STORAGE_PROVIDER;
    delete process.env.NOTION_LIFEOS_ROOT_PAGE_ID;
  });

  test("doctor.ts exits 0 when valid and no notion configured", async () => {
    // Should pass if we just check git and bun without notion
    const scriptPath = join(process.cwd(), "scripts", "doctor.ts");
    process.env.HERMES_HOME = process.cwd(); // Fake a valid directory so existsSync passes
    const result = await $`bun ${scriptPath}`.nothrow();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("[OK] Hermes installation found");
  });

  test("doctor.ts exits 1 when hermes is missing", async () => {
    const scriptPath = join(process.cwd(), "scripts", "doctor.ts");
    process.env.HERMES_HOME = "/path/does/not/exist/ever/12345";
    const result = await $`bun ${scriptPath}`.nothrow();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("[FAIL] Hermes installation not found");
  });

  test("discover.ts fails when credentials are not set", async () => {
    const scriptPath = join(process.cwd(), "scripts", "discover.ts");
    const result = await $`bun ${scriptPath}`.nothrow();
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Error: NOTION_API_KEY and NOTION_LIFEOS_ROOT_PAGE_ID must be set");
  });
});
