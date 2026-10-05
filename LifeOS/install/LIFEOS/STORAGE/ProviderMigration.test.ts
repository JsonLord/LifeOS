import { describe, expect, test } from "bun:test";
import { addCanonical } from "../TOOLS/MemorySystem.ts";
import { runCortex } from "../TOOLS/Cortex.ts";
import { getDerivedCanonicalHashes } from "../TOOLS/DerivedSync.ts";
import { readProjects } from "../PULSE/modules/projects.ts";
import { handleRequest as memoryRequest } from "../PULSE/modules/memory.ts";
import { buildProviderIndex } from "../PULSE/modules/user-index.ts";
import { validateSetupStorage } from "../../../Tools/ScaffoldUser.ts";
import { buildLifeosContextBlock } from "../PULSE/lib/lifeos-context.ts";
import { readProviderFreshness } from "../PULSE/modules/telos.ts";
import { handleRequest as hermesRequest } from "../PULSE/modules/hermes.ts";
import { applyEdit } from "../PULSE/edit/edit-handler.ts";
import { buildProviderMorningBrief } from "../PULSE/checks/life-morning-brief.ts";
import { computeProviderTabFreshness } from "../PULSE/modules/tab-freshness.ts";
import { handleProviderCanonicalRequest } from "../PULSE/Observability/observability.ts";
import { readIdentity } from "../PULSE/setup.ts";
import { validateStorageMappings } from "./CanonicalState.ts";
import type { LifeOSStore } from "./types.ts";

function fixtureStore(): LifeOSStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    provider: "notion", calls,
    async getDocument(key) { calls.push(`document:${key}`); if (key === "principal_memory") return { key, id: "memory", content: "<!-- BEGIN ENTRIES -->\nNAME: Existing\n<!-- END ENTRIES -->\n" }; if (key === "principal_identity") return { key, id: "identity", content: "**Name:** Fixture Person\nProvider identity" }; if (key === "da_identity") return { key, id: "assistant", content: "**Name:** Fixture Coach\n**Role:** Provider identity" }; if (key === "principal_telos") return { key, id: "telos", content: "Fixture TELOS" }; return null; },
    async queryCollection(key, query) { calls.push(`query:${key}:${query?.limit}:${query?.hydrateContent}`); const titles: Record<string, string> = { projects: "Provider Project", goals: "Provider Goal", current_state: "1. Provider next move", knowledge: "Provider Knowledge", ideas: "Provider Idea" }; return titles[key] ? [{ id: `${key}-opaque-id`, collection: key, title: titles[key], content: `${titles[key]} private body`, properties: {} }] : []; },
    async getRecord() { return null; },
    async createRecord(key, value) { calls.push(`create:${key}`); return { id: "created", collection: key, ...value }; },
    async updateRecord() { throw new Error("unused"); }, async appendToRecord() { throw new Error("unused"); },
    async appendToDocument(key) { calls.push(`append:${key}`); }, async replaceDocument(key) { calls.push(`replace:${key}`); },
    async healthCheck() { calls.push("health"); return { ok: true, provider: "notion", message: "fixture healthy" }; },
    async getDocumentRevision(key) { calls.push(`document-revision:${key}`); return { key, revision: "r1", updatedAt: "2026-01-01T00:00:00Z" }; },
    async getCollectionRevision(key) { calls.push(`collection-revision:${key}`); return { key, revision: "r1", updatedAt: "2026-01-01T00:00:00Z" }; },
  };
}

describe("canonical provider migration", () => {
  test("Cortex canonical writes hit LifeOSStore", async () => { const store = fixtureStore(); const result = await addCanonical({ type: "knowledge", entity_type: "research", name: "Boundary", content: "provider backed" }, store); expect(result.ok).toBe(true); expect(store.calls).toContain("create:knowledge"); });
  test("Cortex canonical reads use the provider without a local memory corpus", async () => { const store = fixtureStore(); const result = await runCortex(["status"], { store }); expect(result.exitCode).toBe(0); expect((result.envelope.data as any).canonical.root).toBe("provider:notion"); expect(store.calls.some((call) => call.startsWith("query:knowledge"))).toBe(true); });
  test("Cortex proposal queue remains operational and does not touch canonical store", async () => { const store = fixtureStore(); let queued = false; const payload = JSON.stringify({ type: "proposal", target_file: "ignored", edit: "candidate", confidence: 0.5, rationale: "test" }); const result = await runCortex(["propose", "--adapter", "hermes", "--allow-write", payload], { store, memoryAdd: () => (queued = true, { ok: true, type: "proposal", path: "queue", detail: {} }) }); expect(result.exitCode).toBe(0); expect(queued).toBe(true); expect(store.calls).toEqual([]); });
  test("DerivedSync hashes canonical inputs through the store with no USER tree", async () => { const store = fixtureStore(); const hashes = await getDerivedCanonicalHashes(store); expect(Object.keys(hashes)).toContain("document:principal_memory"); expect(store.calls.some((call) => call.startsWith("query:current_state"))).toBe(true); });
  test("Pulse project endpoint uses bounded hydrated store records", async () => { const store = fixtureStore(); const result = await readProjects(store); expect(result.projects[0].name).toBe("Provider Project"); expect(store.calls).toContain("query:projects:25:true"); });
  test("Pulse user index derives canonical entries from the store", async () => { const store = fixtureStore(); const index = await buildProviderIndex(store); expect(index.user_dir).toBe("provider:notion"); expect(index.files.some((file) => file.path === "documents/principal_memory")).toBe(true); });
  test("Pulse channel context reads canonical identity and memory through the store", async () => { const store = fixtureStore(); const context = await buildLifeosContextBlock("remember", store); expect(context).toContain("NAME: Existing"); expect(store.calls).toContain("document:principal_identity"); expect(store.calls.some((call) => call.startsWith("query:knowledge:5:true"))).toBe(true); });
  test("Pulse TELOS freshness uses provider revisions", async () => { const store = fixtureStore(); const result = await readProviderFreshness(store); expect(result.telos.path).toBe("document:principal_telos"); expect(result.context.files.find((file) => file.slug === "projects")?.path).toBe("collection:projects"); expect(store.calls).toContain("document-revision:principal_telos"); });
  test("Hermes canonical preview uses logical store sources without IDs", async () => { const store = fixtureStore(); const response = await hermesRequest(new Request("http://local/api/hermes/file/principal-identity"), "/api/hermes/file/principal-identity", store); const body = await response!.json(); expect(body.meta.displayPath).toBe("document:principal_identity"); expect(JSON.stringify(body)).not.toContain("notion-page-id"); expect(store.calls).toContain("document:principal_identity"); });
  test("generic Pulse edit route fails closed for provider-managed state", () => { const oldProvider = process.env.LIFEOS_STORAGE_PROVIDER; const oldToken = process.env.NOTION_API_KEY; try { process.env.LIFEOS_STORAGE_PROVIDER = "notion"; process.env.NOTION_API_KEY = "fixture"; const result = applyEdit({ pageId: "test", sourceFile: "LIFEOS/USER/PROJECTS.md", fieldPath: "section:Projects", beforeHash: "x", newContent: "x", draftStartedAt: new Date().toISOString() }); expect(result).toMatchObject({ ok: false, reason: "provider-managed" }); } finally { if (oldProvider === undefined) delete process.env.LIFEOS_STORAGE_PROVIDER; else process.env.LIFEOS_STORAGE_PROVIDER = oldProvider; if (oldToken === undefined) delete process.env.NOTION_API_KEY; else process.env.NOTION_API_KEY = oldToken; } });
  test("Pulse operational memory endpoint remains local", async () => { const response = await memoryRequest(new Request("http://local/api/memory/state"), "/api/memory/state"); expect(response?.status).toBe(200); });
  test("Notion setup validates health and never requests USER scaffolding", async () => { const store = fixtureStore(); const result = await validateSetupStorage({ provider: "notion", filesystem: { userDir: "/does/not/exist" }, notion: { apiKey: "fixture", documents: {}, collections: {}, timeoutMs: 1, maxRetries: 0 } }, store); expect(result).toMatchObject({ ok: true, provider: "notion", scaffold: false }); expect(store.calls).toEqual(["health"]); });
  test("provider failure is explicit and does not fall back to local state", async () => { const store = fixtureStore(); store.queryCollection = async () => { throw new Error("provider unavailable"); }; await expect(readProjects(store)).rejects.toThrow("provider unavailable"); });
  test("morning brief uses bounded canonical provider resources", async () => { const store = fixtureStore(); const result = await buildProviderMorningBrief(store); expect(result).toContain("Provider Goal"); expect(result).toContain("Provider Project"); expect(store.calls).toContain("query:goals:3:true"); expect(store.calls).toContain("query:current_state:5:true"); });
  test("tab freshness uses logical provider revisions", async () => { const store = fixtureStore(); const result = await computeProviderTabFreshness("telos", store); expect(result.perFile.map((file) => file.name)).toEqual(["document:principal_telos", "collection:goals", "collection:current_state"]); expect(store.calls).toContain("collection-revision:goals"); });
  test("observability provider views expose bounded logical metadata", async () => { const store = fixtureStore(); const response = await handleProviderCanonicalRequest(new Request("http://local/api/life/work"), "/api/life/work", store); const body = await response!.json(); const serialized = JSON.stringify(body); expect(serialized).toContain("collection:projects"); expect(serialized).not.toContain("projects-opaque-id"); expect(store.calls).toContain("query:projects:20:false"); });
  test("Pulse setup reads identity from provider without a USER tree", async () => { const store = fixtureStore(); await expect(readIdentity(store)).resolves.toEqual({ name: "fixture coach", description: "Provider identity" }); expect(store.calls).toEqual(["document:da_identity"]); });
  test("mapping validation reports only logical missing and inaccessible resources", async () => { const store = fixtureStore(); store.getDocumentRevision = async (key) => key === "principal_identity" ? { key, revision: "secret-provider-revision", updatedAt: "2026-01-01T00:00:00Z" } : null; const result = await validateStorageMappings({ provider: "notion", filesystem: { userDir: "/unused" }, notion: { apiKey: "secret-token", documents: { principal_identity: "secret-page-id" }, collections: {}, timeoutMs: 1, maxRetries: 0 } }, store); const serialized = JSON.stringify(result); expect(result.ok).toBe(false); expect(result.resources.find((resource) => resource.key === "principal_identity")?.status).toBe("ok"); expect(serialized).not.toContain("secret-page-id"); expect(serialized).not.toContain("secret-token"); expect(serialized).not.toContain("secret-provider-revision"); });
});
