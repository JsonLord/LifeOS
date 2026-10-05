import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertAutoWritable, mutationAuthority } from "./MutationPolicy.ts";
import { buildCoachContext } from "./CoachContext.ts";
import { ProposalLedger } from "./ProposalLedger.ts";

describe("coach policy", () => {
  test("classifies authority deterministically", () => { expect(mutationAuthority("journal")).toBe("auto_write"); expect(mutationAuthority("goal_status")).toBe("propose_first"); expect(mutationAuthority("identity")).toBe("explicit_approval"); });
  test("caller flags cannot self-approve high-authority writes", () => { expect(() => assertAutoWritable("mission")).toThrow("trusted"); expect(() => assertAutoWritable("goal_status")).toThrow("trusted"); expect(() => assertAutoWritable("journal")).not.toThrow(); });
  test("creates an opaque, integrity-checked proposal instead of accepting approval booleans", async () => { const dir = await mkdtemp(join(tmpdir(), "lifeos-proposal-")); try { const ledger = new ProposalLedger(dir); const result = await ledger.propose("mission", { operation: "append_document", key: "mission", content: "candidate" }); expect(result.id).toMatch(/^[0-9a-f-]{36}$/); expect(result.digest).toHaveLength(64); expect((await ledger.load(result.id)).authority).toBe("explicit_approval"); } finally { await rm(dir, { recursive: true, force: true }); } });
  test("cannot disguise an explicit resource write as a lower-authority kind", async () => { const dir = await mkdtemp(join(tmpdir(), "lifeos-proposal-")); try { const ledger = new ProposalLedger(dir); await expect(ledger.propose("goal_status", { operation: "append_document", key: "mission", content: "candidate" })).rejects.toThrow("cannot authorize"); } finally { await rm(dir, { recursive: true, force: true }); } });
  test("fetches only relevant bounded hydrated context", async () => { const calls: string[] = []; const store: any = { getDocument: async (key: string) => (calls.push(key), { content: `doc:${key}` }), queryCollection: async (key: string, q: any) => (calls.push(`${key}:${q.limit}:${q.hydrateContent}`), [{ id: "record", content: "body" }]) }; const context = await buildCoachContext({ request: "Help with my project priority", store, maxRecords: 4 }); expect(calls).toEqual(["strategies", "projects:4:true", "goals:4:true"]); expect((context.collections.projects?.[0] as any).content).toBe("body"); });
});
