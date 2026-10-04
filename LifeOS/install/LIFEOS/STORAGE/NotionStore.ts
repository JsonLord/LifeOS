import { sanitizedRequestError, StoreConfigurationError } from "./errors.ts";
import type { LifeOSCollectionKey, LifeOSDocumentKey, LifeOSRecord, LifeOSRecordInput, LifeOSRecordPatch, LifeOSStore, LifeOSStoreHealth, StorageConfig } from "./types.ts";

type Fetch = typeof fetch;
type NotionObject = Record<string, any>;

function richText(value: any[] = []): string { return value.map((v) => v.plain_text ?? v.text?.content ?? "").join(""); }
export function normalizeNotionBlock(block: NotionObject): string {
  const value = block[block.type] ?? {};
  const text = richText(value.rich_text);
  switch (block.type) {
    case "heading_1": return `# ${text}`; case "heading_2": return `## ${text}`; case "heading_3": return `### ${text}`;
    case "bulleted_list_item": return `- ${text}`; case "numbered_list_item": return `1. ${text}`;
    case "to_do": return `- [${value.checked ? "x" : " "}] ${text}`; case "quote": return `> ${text}`;
    case "code": return `\`\`\`${value.language ?? ""}\n${text}\n\`\`\``; case "divider": return "---";
    case "paragraph": case "callout": return text; default: return text;
  }
}

export class NotionStore implements LifeOSStore {
  readonly provider = "notion" as const;
  private readonly base = "https://api.notion.com/v1";
  constructor(private readonly config: NonNullable<StorageConfig["notion"]>, private readonly fetcher: Fetch = fetch) {
    if (!config.apiKey) throw new StoreConfigurationError("Notion storage requires NOTION_API_KEY");
  }
  private mapping(kind: "documents" | "collections", key: string): string {
    const id = this.config[kind][key as never];
    if (!id) throw new StoreConfigurationError(`No Notion mapping configured for ${key}`);
    return id;
  }
  private async request(path: string, init: RequestInit = {}): Promise<NotionObject> {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetcher(`${this.base}${path}`, { ...init, signal: controller.signal, headers: {
          Authorization: `Bearer ${this.config.apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json", ...init.headers,
        }});
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < this.config.maxRetries) { await Bun.sleep(25 * 2 ** attempt); continue; }
          throw sanitizedRequestError(response.status);
        }
        return await response.json() as NotionObject;
      } catch (error: any) {
        if (error?.name === "StoreRequestError") throw error;
        if (attempt < this.config.maxRetries && error?.name !== "AbortError") { await Bun.sleep(25 * 2 ** attempt); continue; }
        throw sanitizedRequestError();
      } finally { clearTimeout(timer); }
    }
  }
  private async paginate(path: string, body?: NotionObject): Promise<NotionObject[]> {
    const results: NotionObject[] = []; let cursor: string | undefined;
    do {
      const target = !body && cursor ? `${path}${path.includes("?") ? "&" : "?"}start_cursor=${encodeURIComponent(cursor)}` : path;
      const page = await this.request(target, body ? { method: "POST", body: JSON.stringify({ ...body, ...(cursor ? { start_cursor: cursor } : {}) }) } : {});
      results.push(...(page.results ?? [])); cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return results;
  }
  private async blocks(parentId: string, depth = 0): Promise<string[]> {
    if (depth > 12) return ["_[nested content depth limit reached]_\n"];
    const blocks = await this.paginate(`/blocks/${encodeURIComponent(parentId)}/children`); const output: string[] = [];
    for (const block of blocks) { const line = normalizeNotionBlock(block); if (line) output.push(line); if (block.has_children) output.push(...await this.blocks(block.id, depth + 1)); }
    return output;
  }
  async getDocument(key: LifeOSDocumentKey) {
    const id = this.mapping("documents", key); const page = await this.request(`/pages/${encodeURIComponent(id)}`);
    return { key, id, title: this.title(page.properties), content: (await this.blocks(id)).join("\n\n"), updatedAt: page.last_edited_time };
  }
  private title(properties: NotionObject = {}): string | undefined { for (const p of Object.values(properties) as any[]) if (p?.type === "title") return richText(p.title); return undefined; }
  private record(key: LifeOSCollectionKey, page: NotionObject): LifeOSRecord { return { id: page.id, collection: key, title: this.title(page.properties), properties: page.properties ?? {}, updatedAt: page.last_edited_time }; }
  async queryCollection(key: LifeOSCollectionKey, query: any = {}) { const id = this.mapping("collections", key); const pages = await this.paginate(`/databases/${encodeURIComponent(id)}/query`, { page_size: Math.min(query.limit ?? 100, 100), filter: query.filter, sorts: query.sorts }); const selected = query.limit ? pages.slice(0, query.limit) : pages; return selected.map((p) => this.record(key, p)); }
  private async authorizedRecord(key: LifeOSCollectionKey, id: string): Promise<NotionObject> { const expected = this.mapping("collections", key).replaceAll("-", ""); const page = await this.request(`/pages/${encodeURIComponent(id)}`); const actual = String(page.parent?.database_id ?? page.parent?.data_source_id ?? "").replaceAll("-", ""); if (!actual || actual !== expected) throw new StoreConfigurationError(`Record is outside configured ${key} collection`); return page; }
  async getRecord(key: LifeOSCollectionKey, id: string) { return this.record(key, await this.authorizedRecord(key, id)); }
  async createRecord(key: LifeOSCollectionKey, value: LifeOSRecordInput) { const database_id = this.mapping("collections", key); const page = await this.request("/pages", { method: "POST", body: JSON.stringify({ parent: { database_id }, properties: value.properties, ...(value.content ? { children: paragraphChildren(value.content) } : {}) }) }); return this.record(key, page); }
  async updateRecord(key: LifeOSCollectionKey, id: string, patch: LifeOSRecordPatch) { await this.authorizedRecord(key, id); const page = await this.request(`/pages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ properties: patch.properties ?? {} }) }); if (patch.content) await this.request(`/blocks/${encodeURIComponent(id)}/children`, { method: "PATCH", body: JSON.stringify({ children: paragraphChildren(patch.content) }) }); return { ...this.record(key, page), content: patch.content }; }
  async appendToDocument(key: LifeOSDocumentKey, content: string) { const id = this.mapping("documents", key); await this.request(`/blocks/${encodeURIComponent(id)}/children`, { method: "PATCH", body: JSON.stringify({ children: paragraphChildren(content) }) }); }
  async healthCheck(): Promise<LifeOSStoreHealth> { try { const id = this.config.rootPageId ?? Object.values(this.config.documents)[0]; if (!id) return { ok: false, provider: this.provider, message: "no root page or document mappings", mappings: [] }; await this.request(`/pages/${encodeURIComponent(id)}`); return { ok: true, provider: this.provider, message: "Notion reachable", mappings: [...Object.keys(this.config.documents), ...Object.keys(this.config.collections)] }; } catch { return { ok: false, provider: this.provider, message: "Notion unavailable or unauthorized", mappings: [...Object.keys(this.config.documents), ...Object.keys(this.config.collections)] }; } }
}

function paragraphChildren(content: string) { return content.split(/\n{2,}/).map((text) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } })); }
