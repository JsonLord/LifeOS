import { createHash } from "node:crypto";
import type { LifeOSCollectionKey, LifeOSDocumentKey, LifeOSRecord, LifeOSStore } from "./types.ts";
import type { StorageConfig } from "./types.ts";

export const REQUIRED_DOCUMENT_MAPPINGS: LifeOSDocumentKey[] = ["principal_identity", "da_identity", "principal_telos", "principal_memory", "da_memory"];
export const REQUIRED_COLLECTION_MAPPINGS: LifeOSCollectionKey[] = ["goals", "projects", "current_state", "journal", "knowledge", "ideas"];
export interface MappingValidation { ok: boolean; provider: string; resources: Array<{ key: string; kind: "document" | "collection"; status: "ok" | "missing" | "inaccessible"; updatedAt?: string | null }> }

export async function validateStorageMappings(config: StorageConfig, store: LifeOSStore): Promise<MappingValidation> {
  const resources: MappingValidation["resources"] = [];
  for (const key of REQUIRED_DOCUMENT_MAPPINGS) {
    if (config.provider === "notion" && !config.notion?.documents[key]) { resources.push({ key, kind: "document", status: "missing" }); continue; }
    try { const revision = await store.getDocumentRevision(key); resources.push(revision ? { key, kind: "document", status: "ok", updatedAt: revision.updatedAt } : { key, kind: "document", status: "inaccessible" }); } catch { resources.push({ key, kind: "document", status: "inaccessible" }); }
  }
  for (const key of REQUIRED_COLLECTION_MAPPINGS) {
    if (config.provider === "notion" && !config.notion?.collections[key]) { resources.push({ key, kind: "collection", status: "missing" }); continue; }
    try { const revision = await store.getCollectionRevision(key); resources.push(revision ? { key, kind: "collection", status: "ok", updatedAt: revision.updatedAt } : { key, kind: "collection", status: "inaccessible" }); } catch { resources.push({ key, kind: "collection", status: "inaccessible" }); }
  }
  return { ok: resources.every((resource) => resource.status === "ok"), provider: store.provider, resources };
}

export async function getPrincipalIdentity(store: LifeOSStore): Promise<string | null> { return (await store.getDocument("principal_identity"))?.content ?? null; }
export async function getAssistantIdentity(store: LifeOSStore): Promise<string | null> { return (await store.getDocument("da_identity"))?.content ?? null; }
export async function getPrincipalTelos(store: LifeOSStore): Promise<string | null> { return (await store.getDocument("principal_telos"))?.content ?? null; }
export async function getProjects(store: LifeOSStore, limit = 25): Promise<LifeOSRecord[]> { return store.queryCollection("projects", { limit, hydrateContent: true }); }
export async function getActiveGoals(store: LifeOSStore, limit = 25): Promise<LifeOSRecord[]> { return store.queryCollection("goals", { limit, hydrateContent: true }); }
export async function getContacts(store: LifeOSStore, limit = 25): Promise<LifeOSRecord[]> { return store.queryCollection("contacts", { limit, hydrateContent: true }); }
export async function getCurrentState(store: LifeOSStore, limit = 25): Promise<LifeOSRecord[]> { return store.queryCollection("current_state", { limit, hydrateContent: true }); }
export async function getRelevantKnowledge(store: LifeOSStore, limit = 10): Promise<LifeOSRecord[]> { return store.queryCollection("knowledge", { limit, hydrateContent: true }); }

export const CANONICAL_DERIVED_INPUTS = {
  documents: ["principal_identity", "da_identity", "principal_memory", "da_memory", "principal_telos", "mission", "beliefs", "strategies", "writing_style", "definitions", "canonical_content"] as LifeOSDocumentKey[],
  collections: ["goals", "projects", "contacts", "current_state", "knowledge", "ideas", "reviews"] as LifeOSCollectionKey[],
};

/** Provider-neutral source revisions for derived/disposable synchronizers. */
export async function canonicalInputHashes(store: LifeOSStore): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const key of CANONICAL_DERIVED_INPUTS.documents) {
    const value = await store.getDocument(key).catch(() => null); if (value) hashes[`document:${key}`] = createHash("sha256").update(value.content).digest("hex");
  }
  for (const key of CANONICAL_DERIVED_INPUTS.collections) {
    const values = await store.queryCollection(key, { limit: 100, hydrateContent: true }).catch(() => []);
    hashes[`collection:${key}`] = createHash("sha256").update(JSON.stringify(values.map(({ id, updatedAt, content, properties }) => ({ id, updatedAt, content, properties })))).digest("hex");
  }
  return hashes;
}
