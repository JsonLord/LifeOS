import { sanitizedRequestError, StoreConfigurationError, StoreOperationError } from "./errors.ts";
import type { LifeOSCollectionKey, LifeOSDocumentKey, LifeOSQuery, LifeOSRecord, LifeOSRecordInput, LifeOSRecordPatch, LifeOSStore, LifeOSStoreHealth, StorageConfig } from "./types.ts";

type Fetch = typeof fetch;
type NotionObject = Record<string, any>;
type Sleep = (milliseconds: number) => Promise<unknown>;
export const NOTION_API_VERSION = "2026-03-11";
const MAX_RICH_TEXT_CODEPOINTS = 2_000;

function richText(value: any[] = []): string { return value.map((v) => v.plain_text ?? v.text?.content ?? "").join(""); }
export function normalizeNotionBlock(block: NotionObject): string {
  const value = block[block.type] ?? {}; const text = richText(value.rich_text);
  switch (block.type) {
    case "heading_1": return `# ${text}`; case "heading_2": return `## ${text}`; case "heading_3": return `### ${text}`;
    case "bulleted_list_item": return `- ${text}`; case "numbered_list_item": return `1. ${text}`;
    case "to_do": return `- [${value.checked ? "x" : " "}] ${text}`; case "quote": return `> ${text}`;
    case "code": return `\`\`\`${value.language ?? ""}\n${text}\n\`\`\``; case "divider": return "---";
    case "paragraph": case "callout": return text; default: return text;
  }
}

/** Split on Unicode code points, not UTF-16 units, so no input is discarded or corrupted. */
export function chunkNotionText(content: string): string[] {
  const points = Array.from(content); const chunks: string[] = [];
  for (let offset = 0; offset < points.length; offset += MAX_RICH_TEXT_CODEPOINTS) chunks.push(points.slice(offset, offset + MAX_RICH_TEXT_CODEPOINTS).join(""));
  return chunks.length ? chunks : [""];
}
export function notionParagraphChildren(content: string) {
  return chunkNotionText(content).map((text) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: text } }] } }));
}

export class NotionStore implements LifeOSStore {
  readonly provider = "notion" as const;
  private readonly base = "https://api.notion.com/v1";
  constructor(
    private readonly config: NonNullable<StorageConfig["notion"]>,
    private readonly fetcher: Fetch = fetch,
    private readonly sleep: Sleep = Bun.sleep,
  ) { if (!config.apiKey) throw new StoreConfigurationError("Notion storage requires NOTION_API_KEY"); }

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
          Authorization: `Bearer ${this.config.apiKey}`, "Notion-Version": NOTION_API_VERSION, "Content-Type": "application/json", ...init.headers,
        }});
        if (!response.ok) {
          const transient = response.status === 429 || response.status >= 500;
          if (transient && attempt < this.config.maxRetries) {
            const retryAfter = response.status === 429 ? Number(response.headers.get("Retry-After")) : NaN;
            const delay = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 0) * 1_000, 30_000) : 100 * 2 ** attempt;
            await this.sleep(delay); continue;
          }
          throw sanitizedRequestError(response.status);
        }
        return await response.json() as NotionObject;
      } catch (error: any) {
        if (error?.name === "StoreRequestError") throw error;
        if (attempt < this.config.maxRetries) { await this.sleep(100 * 2 ** attempt); continue; }
        throw sanitizedRequestError();
      } finally { clearTimeout(timer); }
    }
  }
  private async paginate(path: string, body?: NotionObject, limit = Number.POSITIVE_INFINITY): Promise<NotionObject[]> {
    const results: NotionObject[] = []; let cursor: string | undefined;
    do {
      const remaining = limit - results.length;
      const requestBody = body ? { ...body, page_size: Math.min(body.page_size ?? 100, remaining, 100), ...(cursor ? { start_cursor: cursor } : {}) } : undefined;
      const target = !body && cursor ? `${path}${path.includes("?") ? "&" : "?"}start_cursor=${encodeURIComponent(cursor)}` : path;
      const page = await this.request(target, requestBody ? { method: "POST", body: JSON.stringify(requestBody) } : {});
      results.push(...(page.results ?? []).slice(0, remaining)); cursor = page.has_more && results.length < limit ? page.next_cursor : undefined;
    } while (cursor);
    return results;
  }
  private async blocks(parentId: string, depth = 0): Promise<string[]> {
    if (depth > 12) throw new StoreOperationError("Notion block nesting exceeds supported depth");
    const blocks = await this.paginate(`/blocks/${encodeURIComponent(parentId)}/children`); const output: string[] = [];
    for (const block of blocks) { const line = normalizeNotionBlock(block); if (line) output.push(line); if (block.has_children) output.push(...await this.blocks(block.id, depth + 1)); }
    return output;
  }
  async getDocument(key: LifeOSDocumentKey) {
    const id = this.mapping("documents", key); const page = await this.request(`/pages/${encodeURIComponent(id)}`);
    return { key, id, title: this.title(page.properties), content: (await this.blocks(id)).join("\n\n"), updatedAt: page.last_edited_time };
  }
  private title(properties: NotionObject = {}): string | undefined { for (const p of Object.values(properties) as any[]) if (p?.type === "title") return richText(p.title); return undefined; }
  private record(key: LifeOSCollectionKey, page: NotionObject, content?: string): LifeOSRecord { return { id: page.id, collection: key, title: this.title(page.properties), ...(content === undefined ? {} : { content }), properties: page.properties ?? {}, updatedAt: page.last_edited_time }; }
  async queryCollection(key: LifeOSCollectionKey, query: LifeOSQuery = {}) {
    const dataSourceId = this.mapping("collections", key); const limit = Math.min(Math.max(query.limit ?? 100, 0), 100);
    const pages = await this.paginate(`/data_sources/${encodeURIComponent(dataSourceId)}/query`, { filter: query.filter, sorts: query.sorts }, limit);
    return Promise.all(pages.map(async (page) => this.record(key, page, query.hydrateContent ? (await this.blocks(page.id)).join("\n\n") : undefined)));
  }
  private async authorizedRecord(key: LifeOSCollectionKey, id: string): Promise<NotionObject> {
    const expected = this.mapping("collections", key).replaceAll("-", ""); const page = await this.request(`/pages/${encodeURIComponent(id)}`);
    const actual = String(page.parent?.data_source_id ?? "").replaceAll("-", "");
    if (!actual || actual !== expected) throw new StoreConfigurationError(`Record is outside configured ${key} data source`);
    return page;
  }
  private async appendChildren(id: string, content: string, skip = 0): Promise<void> {
    const children = notionParagraphChildren(content).slice(skip);
    for (let offset = 0; offset < children.length; offset += 100) await this.request(`/blocks/${encodeURIComponent(id)}/children`, { method: "PATCH", body: JSON.stringify({ children: children.slice(offset, offset + 100) }) });
  }
  async getRecord(key: LifeOSCollectionKey, id: string) { const page = await this.authorizedRecord(key, id); return this.record(key, page, (await this.blocks(id)).join("\n\n")); }
  async createRecord(key: LifeOSCollectionKey, value: LifeOSRecordInput) {
    const data_source_id = this.mapping("collections", key); const initialChildren = value.content === undefined ? [] : notionParagraphChildren(value.content); const page = await this.request("/pages", { method: "POST", body: JSON.stringify({ parent: { type: "data_source_id", data_source_id }, properties: value.properties, ...(value.content === undefined ? {} : { children: initialChildren.slice(0, 100) }) }) });
    if (value.content !== undefined && initialChildren.length > 100) await this.appendChildren(page.id, value.content, 100);
    return this.record(key, page, value.content);
  }
  async updateRecord(key: LifeOSCollectionKey, id: string, patch: LifeOSRecordPatch) {
    if (patch.content !== undefined) throw new StoreOperationError("Notion record body replacement is unsupported; use appendToRecord explicitly");
    await this.authorizedRecord(key, id); const page = await this.request(`/pages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ properties: patch.properties ?? {} }) }); return this.record(key, page);
  }
  async appendToRecord(key: LifeOSCollectionKey, id: string, content: string) { const page = await this.authorizedRecord(key, id); await this.appendChildren(id, content); return this.record(key, page, content); }
  async appendToDocument(key: LifeOSDocumentKey, content: string) { const id = this.mapping("documents", key); await this.appendChildren(id, content); }
  async replaceDocument(_key: LifeOSDocumentKey, _content: string): Promise<void> { throw new StoreOperationError("Notion document replacement is unsupported; use an explicit append or record mutation workflow"); }
  async healthCheck(): Promise<LifeOSStoreHealth> { try { const id = this.config.rootPageId ?? Object.values(this.config.documents)[0]; if (!id) return { ok: false, provider: this.provider, message: "no root page or document mappings", mappings: [] }; await this.request(`/pages/${encodeURIComponent(id)}`); return { ok: true, provider: this.provider, message: "Notion reachable", mappings: [...Object.keys(this.config.documents), ...Object.keys(this.config.collections)] }; } catch { return { ok: false, provider: this.provider, message: "Notion unavailable or unauthorized", mappings: [...Object.keys(this.config.documents), ...Object.keys(this.config.collections)] }; } }
  async getDocumentRevision(key: LifeOSDocumentKey) { const page = await this.request(`/pages/${encodeURIComponent(this.mapping("documents", key))}`); return { key, revision: String(page.last_edited_time ?? page.id), updatedAt: page.last_edited_time ?? null }; }
  async getCollectionRevision(key: LifeOSCollectionKey) { const source = await this.request(`/data_sources/${encodeURIComponent(this.mapping("collections", key))}`); return { key, revision: String(source.last_edited_time ?? source.id), updatedAt: source.last_edited_time ?? null }; }
}
