import { $ } from "bun";

export const NOTION_API_VERSION = "2026-03-11";
const BASE_URL = "https://api.notion.com/v1";

async function fetchNotion(path: string, apiKey: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Notion API returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function discover() {
  const rootPageId = process.env.NOTION_LIFEOS_ROOT_PAGE_ID;
  const apiKey = process.env.NOTION_API_KEY;

  if (!rootPageId || !apiKey) {
    console.error("Error: NOTION_API_KEY and NOTION_LIFEOS_ROOT_PAGE_ID must be set.");
    process.exit(1);
  }

  console.log(`Discovering Notion resources under ${rootPageId}...`);
  try {
    const data = await fetchNotion(`/blocks/${encodeURIComponent(rootPageId)}/children`, apiKey);
    const results = data.results || [];

    const documents: Record<string, string> = {};
    const collections: Record<string, string> = {};

    // We try to map any child pages to documents, and any child databases to collections
    // In a real scenario, this would likely involve fuzzy matching titles.
    for (const block of results) {
       if (block.type === "child_page") {
          const title = block.child_page.title.toLowerCase().replace(/\s+/g, '_');
          documents[title] = block.id;
       } else if (block.type === "child_database") {
          const title = block.child_database.title.toLowerCase().replace(/\s+/g, '_');
          collections[title] = block.id;
       }
    }

    console.log("\n# Suggested storage.toml mappings:");
    console.log(`[notion]\nroot_page_id = "\${NOTION_LIFEOS_ROOT_PAGE_ID}"\n`);

    console.log("[notion.documents]");
    for (const [key, id] of Object.entries(documents)) {
        console.log(`${key} = "${id}"`);
    }

    console.log("\n[notion.collections]");
    for (const [key, id] of Object.entries(collections)) {
        console.log(`${key} = "${id}"`);
    }

    console.log("\nDiscovery complete. Please review and adjust keys to match LifeOSStore expectations.");
  } catch (err: any) {
    console.error("Discovery failed:", err.message || err);
    process.exit(1);
  }
}

discover();
