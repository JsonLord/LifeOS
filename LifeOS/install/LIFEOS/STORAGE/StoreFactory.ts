import { FilesystemStore } from "./FilesystemStore.ts";
import { NotionStore } from "./NotionStore.ts";
import { resolveStorageConfig } from "./StorageConfig.ts";
import type { LifeOSStore, StorageConfig } from "./types.ts";

export function createLifeOSStore(config: StorageConfig = resolveStorageConfig()): LifeOSStore {
  return config.provider === "notion" ? new NotionStore(config.notion!) : new FilesystemStore(config.filesystem);
}
