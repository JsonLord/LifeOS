export const DOCUMENT_KEYS = [
  "principal_identity", "da_identity", "principal_memory", "da_memory", "principal_telos", "mission", "beliefs",
  "strategies", "writing_style", "definitions", "canonical_content",
] as const;
export const COLLECTION_KEYS = [
  "goals", "projects", "contacts", "current_state", "journal", "knowledge", "ideas", "reviews",
] as const;

export type LifeOSDocumentKey = (typeof DOCUMENT_KEYS)[number];
export type LifeOSCollectionKey = (typeof COLLECTION_KEYS)[number];
export type StorageProvider = "filesystem" | "notion";
export interface LifeOSDocument { key: LifeOSDocumentKey; id: string; title?: string; content: string; updatedAt?: string }
export interface LifeOSRecord { id: string; collection: LifeOSCollectionKey; title?: string; content?: string; properties: Record<string, unknown>; updatedAt?: string }
export type LifeOSRecordInput = Omit<LifeOSRecord, "id" | "collection">;
export type LifeOSRecordPatch = Partial<LifeOSRecordInput>;
export interface LifeOSQuery {
  limit?: number;
  filter?: unknown;
  sorts?: unknown[];
  /** Hydrate only the selected, bounded result page bodies. */
  hydrateContent?: boolean;
}
export interface LifeOSStoreHealth { ok: boolean; provider: StorageProvider; message: string; mappings?: string[] }
export interface LifeOSRevision { key: string; revision: string; updatedAt: string | null }

export interface LifeOSStore {
  readonly provider: StorageProvider;
  getDocument(key: LifeOSDocumentKey): Promise<LifeOSDocument | null>;
  queryCollection(key: LifeOSCollectionKey, query?: LifeOSQuery): Promise<LifeOSRecord[]>;
  getRecord(key: LifeOSCollectionKey, id: string): Promise<LifeOSRecord | null>;
  createRecord(key: LifeOSCollectionKey, value: LifeOSRecordInput): Promise<LifeOSRecord>;
  updateRecord(key: LifeOSCollectionKey, id: string, patch: LifeOSRecordPatch): Promise<LifeOSRecord>;
  appendToRecord(key: LifeOSCollectionKey, id: string, content: string): Promise<LifeOSRecord>;
  appendToDocument(key: LifeOSDocumentKey, content: string): Promise<void>;
  replaceDocument(key: LifeOSDocumentKey, content: string, options?: { expectedRevision?: string }): Promise<void>;
  isMapped?(kind: "document" | "collection", key: LifeOSDocumentKey | LifeOSCollectionKey): boolean;
  managedDocumentStatus?(key: LifeOSDocumentKey): Promise<{ initialized: boolean; generation?: string; revision?: string }>;
  initializeManagedDocument?(key: LifeOSDocumentKey): Promise<void>;
  healthCheck(): Promise<LifeOSStoreHealth>;
  getDocumentRevision(key: LifeOSDocumentKey): Promise<LifeOSRevision | null>;
  getCollectionRevision(key: LifeOSCollectionKey): Promise<LifeOSRevision | null>;
}

export interface StorageConfig {
  provider: StorageProvider;
  filesystem: { userDir: string };
  notion?: {
    apiKey: string;
    rootPageId?: string;
    documents: Partial<Record<LifeOSDocumentKey, string>>;
    collections: Partial<Record<LifeOSCollectionKey, string>>;
    timeoutMs: number;
    maxRetries: number;
  };
}
