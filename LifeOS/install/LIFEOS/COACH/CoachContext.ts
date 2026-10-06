import type { LifeOSCollectionKey, LifeOSDocumentKey, LifeOSStore } from "../STORAGE/types.ts";

export interface CoachContext { documents: Partial<Record<LifeOSDocumentKey, string>>; collections: Partial<Record<LifeOSCollectionKey, unknown[]>> }
const domainRules: Array<[RegExp, LifeOSDocumentKey[], LifeOSCollectionKey[]]> = [
  [/identity|who am i/i, ["principal_identity"], []],
  [/mission|purpose|ideal|telos/i, ["principal_telos", "mission"], ["goals"]],
  [/goal/i, ["principal_telos"], ["goals", "current_state"]],
  [/project|priority|plan/i, ["strategies"], ["projects", "goals"]],
  [/contact|relationship|person/i, [], ["contacts"]],
  [/journal|review|week|today|current/i, [], ["current_state", "reviews"]],
  [/idea|knowledge|remember/i, [], ["ideas", "knowledge"]],
];

/** Builds bounded, request-specific context without returning credentials/config. */
export async function buildCoachContext(input: { request: string; store: LifeOSStore; maxRecords?: number }): Promise<CoachContext> {
  const docs = new Set<LifeOSDocumentKey>(); const collections = new Set<LifeOSCollectionKey>();
  for (const [pattern, d, c] of domainRules) if (pattern.test(input.request)) { d.forEach((x) => docs.add(x)); c.forEach((x) => collections.add(x)); }
  if (!docs.size && !collections.size) collections.add("current_state");
  const output: CoachContext = { documents: {}, collections: {} };
  await Promise.all([...docs].slice(0, 3).map(async (key) => { const value = await input.store.getDocument(key); if (value) output.documents[key] = value.content; }));
  await Promise.all([...collections].slice(0, 3).map(async (key) => { output.collections[key] = await input.store.queryCollection(key, { limit: Math.min(input.maxRecords ?? 10, 25), hydrateContent: true }); }));
  return output;
}
