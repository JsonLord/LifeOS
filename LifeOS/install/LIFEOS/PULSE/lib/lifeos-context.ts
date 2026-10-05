/**
 * lifeos-context — the per-turn LifeOS context block for SDK-backed channels.
 *
 * Reads the four files that anchor situational awareness (DA identity,
 * principal identity, TELOS, projects) plus the two hot-layer memory files and
 * assembles a single markdown blob for the SDK system prompt. Extracted from
 * the retired Telegram module (2026-07-15) — the Siri bridge and any future
 * remote channel import it from here.
 */

import { loadLifeosConfig } from "../../TOOLS/LifeosConfig"
import { parseMemoryContent } from "../../TOOLS/MemoryWriter"
import { createLifeOSStore } from "../../STORAGE/StoreFactory.ts"
import type { LifeOSStore } from "../../STORAGE/types.ts"

// Ceiling on the per-turn LifeOS memory injection — fits DA + PRINCIPAL
// identity + TELOS + active sessions + the two _MEMORY.md hot-layer files
// (ISA ISC-29; worst case ~50k under ISC-30).
const CONTEXT_BLOCK_MAX_CHARS = 60_000

// DA display name from LifeosConfig ([da].name); "LifeOS" fallback (PR #1457).
const DA_NAME = ((): string => {
  try { const n = loadLifeosConfig().da.name; if (n && typeof n === "string" && n.length > 0) return n } catch { /* default */ }
  return "LifeOS"
})()

// Principal display name from LifeosConfig ([principal].name); generic fallback
// keeps a not-yet-configured install functional (public issue #1143).
const PRINCIPAL_NAME = ((): string => {
  try { const n = loadLifeosConfig().principal.name; if (n && typeof n === "string" && n.length > 0) return n } catch { /* default */ }
  return "Principal"
})()

function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: "lifeos-context",
    msg,
    ...(data ? { data } : {}),
  }))
}

const CONTEXT_CACHE_TTL_MS = 60_000
let cachedContext: { text: string; builtAt: number } | null = null

/**
 * Format a hot-layer memory file for injection into the LifeOS CONTEXT block.
 * Header pattern per ISA ISC-25/26/27. Empty file renders the empty-but-ready
 * signal so the model sees the file exists and is wired up.
 */
function formatMemoryBlock(title: string, content: string): string {
  const entries = parseMemoryContent(content).entries; const chars = entries.reduce((sum, entry) => sum + entry.length, 0)
  const header = `## ${title} [${entries.length}/48 entries · ${chars}/12288 chars]`
  return entries.length ? `${header}\n${entries.join("\n")}` : `${header}\n(no entries yet)`
}

/**
 * Read the four files that anchor situational awareness — who the principal
 * is, who the DA is, what the principal's goals are, what's in flight today —
 * and assemble a single markdown blob for the SDK system prompt.
 *
 * Cached with a short TTL so a busy session avoids repeated provider reads.
 */
export async function buildLifeosContextBlock(query?: string, store: LifeOSStore = createLifeOSStore()): Promise<string> {
  // When a query is provided, the relevant-memory injection makes the block
  // query-dependent — skip the static cache. The MemoryRetriever has its own
  // per-query cache that absorbs repeated calls within a turn cluster.
  if (cachedContext && !query) {
    const age = Date.now() - cachedContext.builtAt
    if (age < CONTEXT_CACHE_TTL_MS) {
      return cachedContext.text
    }
  }

  // The projects collection is mostly a stable routing table; the volatile part is the
  // "Open Sessions to Resume" section. Inject only that slice — the rest of
  // the file is reachable via the SDK's Read tool on demand.
  const extractActiveSessions = (projectsBody: string): string => {
    const m = projectsBody.match(/##\s+Open Sessions to Resume[\s\S]*$/)
    return m ? m[0].trim() : "(no Open Sessions section found)"
  }

  const [daDoc, principalDoc, telosDoc, principalMemory, daMemory, projects] = await Promise.all([
    store.getDocument("da_identity"), store.getDocument("principal_identity"), store.getDocument("principal_telos"), store.getDocument("principal_memory"), store.getDocument("da_memory"), store.queryCollection("projects", { limit: 10, hydrateContent: true }),
  ])
  const daIdentity = daDoc?.content ?? "(DA_IDENTITY unavailable from canonical store)"
  const principalIdentity = principalDoc?.content ?? "(PRINCIPAL_IDENTITY unavailable from canonical store)"
  const principalTelos = telosDoc?.content ?? "(PRINCIPAL_TELOS unavailable from canonical store)"
  const projectsBody = projects.map((record) => record.content ?? record.title ?? "").join("\n\n")
  const activeSessions = extractActiveSessions(projectsBody)

  // Hot-layer memory reads. readMemory degrades gracefully on missing files
  // (returns zero-entry result, ISC-32) and silently drops malformed entries
  // at read time (ISC-19). Both files are validated by MemoryWriter at write
  // time too, so this is belt-and-suspenders, not the primary gate.
  const memoryBlocks = [formatMemoryBlock("PRINCIPAL MEMORY", principalMemory?.content ?? ""), formatMemoryBlock("DA MEMORY", daMemory?.content ?? "")]

  const today = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })

  // Per-turn relevant-memory retrieval (F6). Only runs when a query is given —
  // typically the latest user message in the active exchange. Pure BM25 over
  // the typed-item corpus (KNOWLEDGE + the two _MEMORY.md files); synchronous
  // and cheap. Returns empty string when nothing scores above threshold —
  // keeps the prompt free of irrelevant noise.
  let relevantMemoryBlock = ""
  if (query && query.trim().length > 0) {
    try {
      const records = await store.queryCollection("knowledge", { limit: 5, hydrateContent: true })
      relevantMemoryBlock = records.length ? `## RELEVANT MEMORY\n${records.map((record) => record.content ?? record.title ?? "").join("\n\n")}` : ""
    } catch (err) {
      log("warn", "context-block: relevant-memory retrieval failed", { error: String(err).slice(0, 120) })
    }
  }

  // Ordering rule (ISA ISC-24 + ISC-76): memory hot-layer blocks land AFTER
  // principal identity, before principal TELOS. The per-turn relevant-memory
  // block lands immediately after the hot-layer, so the model sees:
  //   identity → durable memory → relevant retrieved memory → goals.
  let block = [
    "## LifeOS CONTEXT (refreshed every turn, do not narrate this header)",
    "",
    `**Today:** ${today} (America/Los_Angeles)`,
    "",
    `### About you (${DA_NAME})`,
    daIdentity,
    "",
    `### About ${PRINCIPAL_NAME}`,
    principalIdentity,
    "",
    memoryBlocks[0],
    "",
    memoryBlocks[1],
    ...(relevantMemoryBlock ? ["", relevantMemoryBlock] : []),
    "",
    `### ${PRINCIPAL_NAME}'s TELOS`,
    principalTelos,
    "",
    "### Active sessions / in-flight work",
    activeSessions,
  ].join("\n")

  // Trailing marker tells the model this is a hard cut — it can Read the
  // source files directly if it needs more.
  if (block.length > CONTEXT_BLOCK_MAX_CHARS) {
    block = block.slice(0, CONTEXT_BLOCK_MAX_CHARS - 200) +
      "\n\n…[context truncated to fit per-turn budget — Read the source files directly if you need more]"
  }

  // Only cache the query-free baseline. Query-driven blocks are per-turn.
  if (!query) {
    cachedContext = { text: block, builtAt: Date.now() }
  }
  return block
}
