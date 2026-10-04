import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LifeOSCollectionKey, LifeOSDocumentKey, LifeOSRecord, LifeOSRecordInput, LifeOSRecordPatch, LifeOSStore, LifeOSStoreHealth, StorageConfig } from "./types.ts";

const DOCUMENT_PATHS: Record<LifeOSDocumentKey, string> = {
  principal_identity: "PRINCIPAL/PRINCIPAL_IDENTITY.md", da_identity: "DIGITAL_ASSISTANT/DA_IDENTITY.md",
  principal_telos: "TELOS/PRINCIPAL_TELOS.md", mission: "TELOS/MISSION.md", beliefs: "TELOS/BELIEFS.md",
  strategies: "TELOS/STRATEGIES.md", writing_style: "AI_WRITING_PATTERNS.md", definitions: "DEFINITIONS.md",
  canonical_content: "CANONICAL_CONTENT.md",
};
const COLLECTION_PATHS: Record<LifeOSCollectionKey, string> = {
  goals: "TELOS/GOALS.md", projects: "PROJECTS.md", contacts: "CONTACTS.md",
  current_state: "TELOS/CURRENT_STATE", journal: "MEMORY/JOURNAL", knowledge: "MEMORY/KNOWLEDGE",
  ideas: "MEMORY/IDEAS", reviews: "MEMORY/REVIEWS",
};

export class FilesystemStore implements LifeOSStore {
  readonly provider = "filesystem" as const;
  constructor(private readonly config: StorageConfig["filesystem"]) {}
  private path(value: string) { return join(this.config.userDir, value); }
  async getDocument(key: LifeOSDocumentKey) {
    const path = this.path(DOCUMENT_PATHS[key]);
    try { return { key, id: path, content: await readFile(path, "utf8"), updatedAt: (await stat(path)).mtime.toISOString() }; }
    catch (error: any) { if (error?.code === "ENOENT") return null; throw error; }
  }
  async queryCollection(key: LifeOSCollectionKey): Promise<LifeOSRecord[]> {
    const path = this.path(COLLECTION_PATHS[key]);
    try {
      const info = await stat(path);
      if (info.isFile()) return [{ id: path, collection: key, content: await readFile(path, "utf8"), properties: {} }];
      const names = (await readdir(path)).filter((name) => name.endsWith(".md")).sort();
      return Promise.all(names.map(async (name) => ({ id: join(path, name), collection: key, title: name.replace(/\.md$/, ""), content: await readFile(join(path, name), "utf8"), properties: {} })));
    } catch (error: any) { if (error?.code === "ENOENT") return []; throw error; }
  }
  async getRecord(key: LifeOSCollectionKey, id: string) { return (await this.queryCollection(key)).find((r) => r.id === id) ?? null; }
  async createRecord(key: LifeOSCollectionKey, value: LifeOSRecordInput) {
    const base = this.path(COLLECTION_PATHS[key]); await mkdir(base, { recursive: true });
    const id = join(base, `${Date.now()}-${crypto.randomUUID()}.md`); await writeFile(id, value.content ?? "", "utf8");
    return { ...value, id, collection: key };
  }
  async updateRecord(key: LifeOSCollectionKey, id: string, patch: LifeOSRecordPatch) {
    const old = await this.getRecord(key, id); if (!old) throw new Error("Filesystem record not found");
    if (patch.content !== undefined) await writeFile(id, patch.content, "utf8"); return { ...old, ...patch };
  }
  async appendToDocument(key: LifeOSDocumentKey, content: string) { const path = this.path(DOCUMENT_PATHS[key]); await mkdir(dirname(path), { recursive: true }); await appendFile(path, content, "utf8"); }
  async healthCheck(): Promise<LifeOSStoreHealth> { try { await stat(this.config.userDir); return { ok: true, provider: this.provider, message: "user directory accessible" }; } catch { return { ok: false, provider: this.provider, message: "user directory unavailable" }; } }
}
