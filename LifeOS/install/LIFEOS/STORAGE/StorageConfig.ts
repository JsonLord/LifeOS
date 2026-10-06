import { homedir } from "node:os";
import { join } from "node:path";
import { COLLECTION_KEYS, DOCUMENT_KEYS, type StorageConfig, type StorageProvider } from "./types.ts";
import { StoreConfigurationError } from "./errors.ts";

type Env = Record<string, string | undefined>;
const envKey = (kind: "DOCUMENT" | "COLLECTION", key: string) => `NOTION_${kind}_${key.toUpperCase()}_ID`;

export function resolveStorageConfig(input: { provider?: string; userDir?: string; env?: Env; config?: any } = {}): StorageConfig {
  const env = input.env ?? process.env;
  let raw = input.config;
  if (!raw && env.LIFEOS_STORAGE_CONFIG_PATH) raw = require(env.LIFEOS_STORAGE_CONFIG_PATH);
  const provider = (input.provider ?? raw?.storage?.provider ?? env.LIFEOS_STORAGE_PROVIDER ?? "filesystem") as StorageProvider;
  if (provider !== "filesystem" && provider !== "notion") throw new StoreConfigurationError(`Unsupported storage provider: ${provider}`);
  const filesystem = { userDir: input.userDir ?? env.LIFEOS_USER_DIR ?? join(homedir(), ".claude/LIFEOS/USER") };
  if (provider === "filesystem") return { provider, filesystem };
  const apiKey = env.NOTION_API_KEY;
  if (!apiKey) throw new StoreConfigurationError("Notion storage requires NOTION_API_KEY");
  const documents: Record<string, string> = {};
  const collections: Record<string, string> = {};
  for (const key of DOCUMENT_KEYS) { const value = raw?.notion?.documents?.[key] ?? env[envKey("DOCUMENT", key)]; if (value) documents[key] = interpolate(value, env); }
  for (const key of COLLECTION_KEYS) { const value = raw?.notion?.collections?.[key] ?? env[envKey("COLLECTION", key)]; if (value) collections[key] = interpolate(value, env); }
  return { provider, filesystem, notion: {
    apiKey, rootPageId: raw?.notion?.root_page_id ? interpolate(raw.notion.root_page_id, env) : env.NOTION_LIFEOS_ROOT_PAGE_ID, documents, collections,
    timeoutMs: Number(env.NOTION_TIMEOUT_MS || 10_000), maxRetries: Number(env.NOTION_MAX_RETRIES || 2),
  }};
}

function interpolate(value: unknown, env: Env): string {
  if (typeof value !== "string") throw new StoreConfigurationError("Notion mappings must be strings");
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => { const resolved = env[name]; if (!resolved) throw new StoreConfigurationError(`Missing required environment variable ${name}`); return resolved; });
}
