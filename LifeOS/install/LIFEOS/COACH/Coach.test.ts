import { describe, expect, test } from "bun:test";
import { authorizeMutation, mutationAuthority } from "./MutationPolicy.ts";
import { buildCoachContext } from "./CoachContext.ts";

describe("coach policy", () => {
  test("classifies authority deterministically", () => { expect(mutationAuthority("journal")).toBe("auto_write"); expect(mutationAuthority("goal_status")).toBe("propose_first"); expect(mutationAuthority("identity")).toBe("explicit_approval"); });
  test("gates high-authority writes", () => { expect(() => authorizeMutation({ kind: "mission" })).toThrow("explicit approval"); expect(() => authorizeMutation({ kind: "mission", approved: true })).not.toThrow(); });
  test("fetches only relevant bounded context", async () => { const calls: string[] = []; const store: any = { getDocument: async (key: string) => (calls.push(key), { content: `doc:${key}` }), queryCollection: async (key: string, q: any) => (calls.push(`${key}:${q.limit}`), []) }; const context = await buildCoachContext({ request: "Help with my project priority", store, maxRecords: 4 }); expect(calls).toEqual(["strategies", "projects:4", "goals:4"]); expect(context.documents.strategies).toBe("doc:strategies"); });
});
