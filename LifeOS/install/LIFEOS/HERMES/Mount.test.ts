import { describe, expect, test } from "bun:test";
import { ensureCoachMemoryDisabled, resolveHermesProfileHome, resolveHermesWorkspace } from "./Mount.ts";

describe("profile-scoped mount", () => {
  test("targets only the selected profile", () => { expect(resolveHermesProfileHome("/hermes", "coach")).toBe("/hermes/profiles/coach"); expect(resolveHermesProfileHome("/hermes")).toBe("/hermes"); });
  test("does not nest an already selected profile", () => { expect(resolveHermesProfileHome("/hermes/profiles/coach", "coach")).toBe("/hermes/profiles/coach"); });
  test("isolates profile workspace unless explicitly overridden", () => { expect(resolveHermesWorkspace("/hermes/profiles/coach", "coach", undefined)).toBe("/hermes/profiles/coach/workspace"); expect(resolveHermesWorkspace("/hermes/profiles/coach", "coach", "/safe/custom")).toBe("/safe/custom"); });
  test("preserves unrelated config while disabling competing personal memory", () => { const before = "model: local\nmemory:\n  cache_enabled: true\nother: keep\n"; const result = ensureCoachMemoryDisabled(before).yaml; expect(result).toContain("model: local"); expect(result).toContain("cache_enabled: true"); expect(result).toContain("other: keep"); expect(result).toContain("user_profile_enabled: false"); });
});
