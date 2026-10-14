import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Debian-Devil Installation Scripts", () => {
  test("package.json defines the required scripts", () => {
    const packageJsonPath = join(process.cwd(), "package.json");
    expect(existsSync(packageJsonPath)).toBe(true);

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const scripts = packageJson.scripts || {};

    const requiredScripts = [
      "setup",
      "doctor",
      "discover",
      "validate",
      "coach:mount",
      "upgrade",
      "rollback",
    ];

    for (const reqScript of requiredScripts) {
      expect(scripts).toHaveProperty(reqScript);
      expect(typeof scripts[reqScript]).toBe("string");
    }
  });

  test("script files exist on disk", () => {
    const scriptFiles = [
      "setup.ts",
      "doctor.ts",
      "discover.ts",
      "validate.ts",
      "mount.ts",
      "upgrade.ts",
      "rollback.ts",
    ];

    for (const file of scriptFiles) {
      const scriptPath = join(process.cwd(), "scripts", file);
      expect(existsSync(scriptPath)).toBe(true);
    }
  });
});
