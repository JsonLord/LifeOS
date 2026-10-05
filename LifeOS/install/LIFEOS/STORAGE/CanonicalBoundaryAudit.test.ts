import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODULES = [
  "PULSE/lib/lifeos-context.ts",
  "PULSE/modules/telos.ts",
  "PULSE/modules/hermes.ts",
  "PULSE/modules/projects.ts",
];
const MARKED_MODULES = [
  "PULSE/checks/life-morning-brief.ts",
  "PULSE/modules/tab-freshness.ts",
  "PULSE/Observability/observability.ts",
  "PULSE/setup.ts",
];
const FORBIDDEN = /USER\/|PRINCIPAL_IDENTITY\.md|PRINCIPAL_TELOS\.md|PRINCIPAL_MEMORY\.md|DA_MEMORY\.md|PROJECTS\.md|CONTACTS\.md|TELOS\/GOALS\.md/;

describe("canonical boundary source audit", () => {
  test("provider-neutral production paths do not reopen canonical USER files", () => {
    for (const relative of MODULES) {
      const source = readFileSync(join(import.meta.dir, "..", relative), "utf8");
      const providerNeutral = source.replace(/\/\/ FILESYSTEM_COMPAT_BEGIN[\s\S]*?\/\/ FILESYSTEM_COMPAT_END/g, "");
      expect(providerNeutral.match(FORBIDDEN), `${relative} contains direct canonical path access`).toBeNull();
    }
  });
  test("new provider-backed paths cannot reopen canonical USER files", () => {
    for (const relative of MARKED_MODULES) {
      const source = readFileSync(join(import.meta.dir, "..", relative), "utf8");
      const sections = [...source.matchAll(/\/\/ PROVIDER_NEUTRAL_BEGIN([\s\S]*?)\/\/ PROVIDER_NEUTRAL_END/g)].map((match) => match[1]).join("\n");
      expect(sections.length, `${relative} must mark its provider-neutral path`).toBeGreaterThan(0);
      expect(sections.match(FORBIDDEN), `${relative} provider path contains direct canonical access`).toBeNull();
    }
  });
});
