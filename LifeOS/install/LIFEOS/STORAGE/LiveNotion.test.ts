import { expect, test } from "bun:test";
import { NotionStore } from "./NotionStore.ts";
import { resolveStorageConfig } from "./StorageConfig.ts";

const enabled = process.env.LIFEOS_LIVE_NOTION_TEST === "1";
test.skipIf(!enabled)("live Notion dedicated fixture CRUD without deletion", async () => {
  const apiKey = process.env.NOTION_API_KEY;
  const pageId = process.env.LIFEOS_NOTION_TEST_PAGE_ID;
  const dataSourceId = process.env.LIFEOS_NOTION_TEST_DATA_SOURCE_ID;
  const titleProperty = process.env.LIFEOS_NOTION_TEST_TITLE_PROPERTY;
  if (!apiKey || !pageId || !dataSourceId || !titleProperty) throw new Error("Live test requires NOTION_API_KEY, LIFEOS_NOTION_TEST_PAGE_ID, LIFEOS_NOTION_TEST_DATA_SOURCE_ID, and LIFEOS_NOTION_TEST_TITLE_PROPERTY");
  const configured = resolveStorageConfig();
  const productionIds = [
    ...Object.entries(process.env).filter(([key]) => /^NOTION_(DOCUMENT|COLLECTION)_/.test(key)).map(([, value]) => value),
    ...Object.values(configured.notion?.documents ?? {}),
    ...Object.values(configured.notion?.collections ?? {}),
  ];
  if (productionIds.includes(dataSourceId) || productionIds.includes(pageId)) throw new Error("Refusing live fixture: a dedicated test mapping matches a production mapping");

  const store = new NotionStore({ apiKey, rootPageId: pageId, documents: { mission: pageId }, collections: { reviews: dataSourceId }, timeoutMs: 15_000, maxRetries: 2 });
  expect((await store.healthCheck()).ok).toBe(true);
  expect(await store.getDocument("mission")).not.toBeNull();
  expect((await store.queryCollection("reviews", { limit: 1, hydrateContent: true })).length).toBeLessThanOrEqual(1);
  expect((await store.getDocumentRevision("mission"))?.updatedAt).toBeTruthy();
  expect((await store.getCollectionRevision("reviews"))?.updatedAt).toBeTruthy();

  const marker = `[LIFEOS TEST ${new Date().toISOString()}]`;
  const title = (text: string) => ({ type: "title", title: [{ type: "text", text: { content: text } }] });
  const created = await store.createRecord("reviews", { title: marker, content: `${marker} created`, properties: { [titleProperty]: title(marker) } });
  await store.appendToRecord("reviews", created.id, `${marker} appended`);
  await store.updateRecord("reviews", created.id, { properties: { [titleProperty]: title(`${marker} RETIRED`) } });
  const readBack = await store.getRecord("reviews", created.id);
  expect(readBack?.title).toContain("RETIRED");
  expect(readBack?.content).toContain(`${marker} appended`);
});
