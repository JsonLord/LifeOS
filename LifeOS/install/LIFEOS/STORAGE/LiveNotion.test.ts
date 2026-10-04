import { expect, test } from "bun:test";
import { createLifeOSStore, resolveStorageConfig } from "./index.ts";

test.skipIf(process.env.LIFEOS_LIVE_NOTION_TEST !== "1")("live Notion read-only health check", async () => {
  const store = createLifeOSStore(resolveStorageConfig({ provider: "notion" }));
  const health = await store.healthCheck();
  expect(health.ok).toBe(true);
});
