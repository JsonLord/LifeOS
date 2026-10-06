import { describe, expect, test } from "bun:test";
import { canonicalInputHashes } from "./CanonicalState.ts";
import { plannedActions, runSync } from "../TOOLS/DerivedSync.ts";
import { providerCanonicalDenyCorpus } from "../TOOLS/DeriveDenyHashes.ts";
import type { LifeOSStore } from "./types.ts";

function store(): LifeOSStore {
  return {
    provider: "notion", isMapped: () => true,
    async getDocument(key) { return { key, id: "opaque", content: key === "principal_identity" ? "Ada Lovelace" : "Analytical Engine", updatedAt: "now" }; },
    async queryCollection(key) { return [{ id: "opaque", collection: key, title: "Charles Babbage", content: "Somerville Circle", properties: {} }]; },
    async getRecord() { return null; }, async createRecord() { throw new Error("unused"); }, async updateRecord() { throw new Error("unused"); }, async appendToRecord() { throw new Error("unused"); }, async appendToDocument() {}, async replaceDocument() {}, async healthCheck() { return { ok: true, provider: "notion", message: "ok" }; }, async getDocumentRevision(key) { return { key, revision: "r", updatedAt: null }; }, async getCollectionRevision(key) { return { key, revision: "r", updatedAt: null }; },
  };
}

describe("provider derived synchronization", () => {
  test("mapped provider outage fails instead of becoming empty canonical state", async () => { const fixture = store(); fixture.getDocument = async () => { throw new Error("provider outage"); }; await expect(canonicalInputHashes(fixture)).rejects.toThrow("provider outage"); });
  test("failed provider collection does not advance DerivedSync state", async () => { const fixture = store(); fixture.queryCollection = async () => { throw new Error("provider outage"); }; let writes = 0; await expect(runSync(false, false, fixture, { readState: () => ({ fileHashes: { existing: "hash" }, lastRun: "2026-01-01T00:00:00Z" }), writeState: () => { writes++; }, appendLog: () => { writes++; } })).rejects.toThrow("provider outage"); expect(writes).toBe(0); });
  test("logical privacy corpus changes trigger only provider-safe deny derivation", () => { const actions = plannedActions(["document:principal_identity", "document:principal_telos", "collection:contacts", "collection:current_state", "collection:projects"], "notion"); expect(actions.map((action) => action.kind)).toEqual(["deny-hashes"]); expect(actions[0].cmd).toContain("--provider-store"); });
  test("deny corpus reads provider identity, TELOS and contacts without USER files", async () => { const corpus = await providerCanonicalDenyCorpus(store()); expect(corpus).toContain("Ada Lovelace"); expect(corpus).toContain("Analytical Engine"); expect(corpus).toContain("Charles Babbage"); expect(corpus).toContain("Somerville Circle"); });
});
