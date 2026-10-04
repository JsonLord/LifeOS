import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
async function fixture() {
  const root = join(tmpdir(), `lifeos-cli-${crypto.randomUUID()}`); roots.push(root);
  await mkdir(join(root, "TELOS/CURRENT_STATE"), { recursive: true });
  await writeFile(join(root, "TELOS/MISSION.md"), "fixture mission");
  await writeFile(join(root, "TELOS/CURRENT_STATE/HEALTH.md"), "fixture current body");
  return root;
}
async function cli(root: string, args: string[], stdin?: string) {
  const process = Bun.spawn(["bun", join(import.meta.dir, "LifeosCoach.ts"), ...args], { env: { ...Bun.env, LIFEOS_USER_DIR: root, LIFEOS_STORAGE_PROVIDER: "filesystem", LIFEOS_PROPOSAL_DIR: join(root, ".proposals") }, stdin: stdin === undefined ? "ignore" : new Blob([stdin]), stdout: "pipe", stderr: "pipe" });
  return { code: await process.exited, stdout: await new Response(process.stdout).text(), stderr: await new Response(process.stderr).text() };
}

describe("Hermes-facing LifeOS CLI", () => {
  test("reads and hydrates bounded context through LifeOSStore", async () => { const root = await fixture(); const read = await cli(root, ["read", "mission"]); expect(read.code).toBe(0); expect(JSON.parse(read.stdout).content).toBe("fixture mission"); const context = await cli(root, ["context", "review current health", "--limit", "1"]); expect(context.code).toBe(0); expect(JSON.parse(context.stdout).collections.current_state[0].content).toBe("fixture current body"); });
  test("does not let a non-interactive model approve", async () => { const root = await fixture(); const proposed = await cli(root, ["propose"], JSON.stringify({ kind: "mission", request: { operation: "append_document", key: "mission", content: "unsafe" } })); expect(proposed.code).toBe(0); const id = JSON.parse(proposed.stdout).id; const approval = await cli(root, ["approve", id]); expect(approval.code).not.toBe(0); expect(approval.stderr).toContain("interactive trusted terminal"); expect(await Bun.file(join(root, "TELOS/MISSION.md")).text()).toBe("fixture mission"); });
  test("cannot disguise a mission write as an auto-write observation", async () => { const root = await fixture(); const result = await cli(root, ["write"], JSON.stringify({ kind: "observation", request: { operation: "append_document", key: "mission", content: "unsafe" } })); expect(result.code).not.toBe(0); expect(result.stderr).toContain("cannot authorize"); expect(await Bun.file(join(root, "TELOS/MISSION.md")).text()).toBe("fixture mission"); });
});
