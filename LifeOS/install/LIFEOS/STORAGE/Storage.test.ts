import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLifeOSStore, FilesystemStore, normalizeNotionBlock, NotionStore, resolveStorageConfig } from "./index.ts";

const dirs: string[] = []; afterEach(async () => Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))));
describe("storage providers", () => {
  test("filesystem is the credential-free default", () => { const c = resolveStorageConfig({ env: {} }); expect(c.provider).toBe("filesystem"); expect(createLifeOSStore(c)).toBeInstanceOf(FilesystemStore); });
  test("filesystem preserves markdown document behavior", async () => { const root = await mkdtemp(join(tmpdir(), "lifeos-store-")); dirs.push(root); await mkdir(join(root, "TELOS")); await writeFile(join(root, "TELOS/MISSION.md"), "mission"); const store = new FilesystemStore({ userDir: root }); expect((await store.getDocument("mission"))?.content).toBe("mission"); });
  test("notion fails closed without a token", () => expect(() => resolveStorageConfig({ provider: "notion", env: {} })).toThrow("NOTION_API_KEY"));
  test("resolves logical TOML-style mappings and environment placeholders", () => { const c = resolveStorageConfig({ env: { NOTION_API_KEY: "fixture", ROOT: "root-id" }, config: { storage: { provider: "notion" }, notion: { root_page_id: "${ROOT}", documents: { mission: "mission-id" } } } }); expect(c.notion?.rootPageId).toBe("root-id"); expect(c.notion?.documents.mission).toBe("mission-id"); });
  test("normalizes blocks", () => expect(normalizeNotionBlock({ type: "heading_2", heading_2: { rich_text: [{ plain_text: "Aim" }] } })).toBe("## Aim"));
  test("paginates and recursively retrieves children", async () => {
    const calls: string[] = []; const fake = async (url: any, init: any = {}) => { calls.push(String(url)); const path = String(url);
      if (path.includes("/pages/page")) return new Response(JSON.stringify({ id: "page", properties: {} }), { status: 200 });
      const cursor = path.includes("start_cursor=next");
      return new Response(JSON.stringify(cursor ? { results: [{ id: "two", type: "paragraph", paragraph: { rich_text: [{ plain_text: "world" }] }, has_children: false }], has_more: false } : { results: [{ id: "one", type: "paragraph", paragraph: { rich_text: [{ plain_text: "hello" }] }, has_children: false }], has_more: true, next_cursor: "next" }), { status: 200 });
    };
    const store = new NotionStore({ apiKey: "fixture-token", documents: { mission: "page" }, collections: {}, timeoutMs: 100, maxRetries: 0 }, fake as any);
    expect((await store.getDocument("mission"))?.content).toBe("hello\n\nworld"); expect(calls.length).toBe(3); expect(calls[2]).toContain("start_cursor=next");
  });
  test("sanitizes remote errors and never includes token/body", async () => { const store = new NotionStore({ apiKey: "super-secret-fixture", documents: { mission: "page" }, collections: {}, timeoutMs: 100, maxRetries: 0 }, (async () => new Response("super-secret-fixture backend detail", { status: 401 })) as any); await expect(store.getDocument("mission")).rejects.toThrow("HTTP 401"); try { await store.getDocument("mission"); } catch (e: any) { expect(e.message).not.toContain("super-secret"); } });
  test("retries transient failures", async () => { let n = 0; const store = new NotionStore({ apiKey: "x", rootPageId: "root", documents: {}, collections: {}, timeoutMs: 100, maxRetries: 1 }, (async () => { n++; return new Response(JSON.stringify({ id: "root" }), { status: n === 1 ? 503 : 200 }); }) as any); expect((await store.healthCheck()).ok).toBe(true); expect(n).toBe(2); });
  test("times out with a sanitized error", async () => { const store = new NotionStore({ apiKey: "x", documents: { mission: "page" }, collections: {}, timeoutMs: 5, maxRetries: 0 }, ((_: any, init: any) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error(), { name: "AbortError" }))))) as any); await expect(store.getDocument("mission")).rejects.toThrow("Notion request failed"); });
});
