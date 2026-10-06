/**
 * Pulse Telos Freshness Module
 *
 * Read-only consumer of the TelosFreshness library at
 * `~/.claude/LIFEOS/TOOLS/TelosFreshness.ts`. Exposes:
 *
 *   GET /api/telos/freshness         → full freshness JSON (all sections)
 *   GET /api/telos/freshness/stale   → stale sections only, sorted
 *   GET /api/telos/freshness/summary → tiny payload for statusline / DA panel
 *
 * The DA panel and statusline call /summary every refresh; the Interview
 * skill calls /freshness once at the top of /interview to drive its
 * conversation. No writes here — bumps go through the Interview workflow,
 * which calls bumpTelosTimestamp() in the lib.
 */

import { readTelosFreshness, readContextFreshness, sectionSlug, freshnessPct, freshnessGrade, aggregateGrade, STALENESS_THRESHOLDS, type TelosFreshness, type ContextFreshness, type FileFreshness, type SectionFreshness } from "../../TOOLS/TelosFreshness";
import { writeFreshnessCache } from "../../TOOLS/FreshnessCache";
import { createLifeOSStore } from "../../STORAGE/StoreFactory.ts";
import { resolveStorageConfig } from "../../STORAGE/StorageConfig.ts";
import type { LifeOSDocumentKey, LifeOSStore } from "../../STORAGE/types.ts";

function refreshFileCache(): void {
  try {
    writeFreshnessCache();
  } catch {
    // best-effort — file cache desync is recoverable
  }
}

const MODULE_NAME = "telos";

interface ModuleState {
  running: boolean;
  startedAt: Date | null;
  lastReadAt: Date | null;
  cachedTelos: TelosFreshness | null;
  cachedContext: ContextFreshness | null;
  cacheExpiresAt: number;
}

const state: ModuleState = {
  running: false,
  startedAt: null,
  lastReadAt: null,
  cachedTelos: null,
  cachedContext: null,
  cacheExpiresAt: 0,
};

// Cache freshness reads for 60s — files are small and cheap to re-read, but
// the statusline polls frequently and there's no value in scanning per request.
// Cache invalidates on Pulse /reload (calls invalidate()).
const CACHE_TTL_MS = 60_000;

function ageDays(updated: Date | null): number | null { return updated ? Math.max(0, Math.floor((Date.now() - updated.getTime()) / 86_400_000)) : null; }
export async function readProviderFreshness(store: LifeOSStore): Promise<{ telos: TelosFreshness; context: ContextFreshness }> {
  const document = await store.getDocument("principal_telos"); const revision = await store.getDocumentRevision("principal_telos");
  const updated = revision?.updatedAt ? new Date(revision.updatedAt) : null; const fileAge = ageDays(updated);
  const sections: SectionFreshness[] = []; const lines = (document?.content ?? "").split("\n");
  for (let index = 0; index < lines.length; index++) { const match = lines[index].match(/^##\s+(.+)/); if (!match) continue; const slug = sectionSlug(match[1]); const thresholdDays = STALENESS_THRESHOLDS[slug] ?? 180; sections.push({ name: match[1], slug, updated, ageDays: fileAge, thresholdDays, stale: fileAge === null || fileAge > thresholdDays, preview: lines.slice(index + 1).find((line) => line.trim() && !line.startsWith("#"))?.trim().slice(0, 80) ?? "", line: index + 1 }); }
  const staleSections = sections.filter((section) => section.stale).sort((a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity));
  const telos: TelosFreshness = { path: "document:principal_telos", fileUpdated: updated, fileAgeDays: fileAge, sections, staleSections, hasStale: !updated || staleSections.length > 0, totalSections: sections.length };
  const resources: Array<[LifeOSDocumentKey, number]> = [["principal_telos", 30], ["principal_identity", 90], ["da_identity", 180], ["principal_memory", 30], ["da_memory", 30]];
  const files: FileFreshness[] = [];
  for (const [key, threshold] of resources) { const value = await store.getDocumentRevision(key); const date = value?.updatedAt ? new Date(value.updatedAt) : null; const age = ageDays(date); const pct = freshnessPct(age, threshold); files.push({ slug: key, path: `document:${key}`, name: key, updated: date, age_days: age, threshold_days: threshold, reviewed: date, reviewed_age_days: age, effective_updated: date, effective_age_days: age, effective_threshold_days: threshold, effective_reviewed: date, effective_reviewed_age_days: age, stale: age === null || age > threshold, is_auto_generated: false, pct, grade: freshnessGrade(age, threshold) }); }
  const projectRevision = await store.getCollectionRevision("projects"); const projectDate = projectRevision?.updatedAt ? new Date(projectRevision.updatedAt) : null; const projectAge = ageDays(projectDate); files.push({ slug: "projects", path: "collection:projects", name: "projects", updated: projectDate, age_days: projectAge, threshold_days: 30, reviewed: projectDate, reviewed_age_days: projectAge, effective_updated: projectDate, effective_age_days: projectAge, effective_threshold_days: 30, effective_reviewed: projectDate, effective_reviewed_age_days: projectAge, stale: projectAge === null || projectAge > 30, is_auto_generated: false, pct: freshnessPct(projectAge, 30), grade: freshnessGrade(projectAge, 30) });
  const grades = files.map((file) => file.grade); const stale = files.filter((file) => file.stale);
  return { telos, context: { files, total: files.length, fresh_count: files.length - stale.length, stale_count: stale.length, most_stale: stale.sort((a, b) => (b.effective_age_days ?? Infinity) - (a.effective_age_days ?? Infinity))[0] ?? null, generated_at: new Date(), overall_pct: files.length ? Math.round(files.reduce((sum, file) => sum + file.pct, 0) / files.length) : 0, overall_grade: aggregateGrade(grades) } };
}

async function ensureCache(): Promise<void> {
  const now = Date.now();
  if (state.cachedTelos && state.cachedContext && now < state.cacheExpiresAt) return;
  const storage = resolveStorageConfig();
  if (storage.provider === "filesystem") { state.cachedTelos = readTelosFreshness(); state.cachedContext = readContextFreshness(); }
  else { const result = await readProviderFreshness(createLifeOSStore(storage)); state.cachedTelos = result.telos; state.cachedContext = result.context; }
  state.cacheExpiresAt = now + CACHE_TTL_MS;
  state.lastReadAt = new Date();
}

async function freshness(): Promise<TelosFreshness> {
  await ensureCache();
  return state.cachedTelos!;
}

async function contextFreshness(): Promise<ContextFreshness> {
  await ensureCache();
  return state.cachedContext!;
}

export async function start(): Promise<void> {
  console.log(`[${MODULE_NAME}] Starting...`);
  state.running = true;
  state.startedAt = new Date();
  // Prime the cache so /summary is hot on first request.
  await ensureCache();
  // Warm the statusline render-path cache file at startup.
  if (resolveStorageConfig().provider === "filesystem") refreshFileCache();
  console.log(`[${MODULE_NAME}] Started — telos: ${state.cachedTelos?.totalSections ?? 0} sections (${state.cachedTelos?.staleSections.length ?? 0} stale), context: ${state.cachedContext?.total ?? 0} files (${state.cachedContext?.stale_count ?? 0} stale)`);
}

export async function stop(): Promise<void> {
  console.log(`[${MODULE_NAME}] Stopping...`);
  state.running = false;
  state.cachedTelos = null;
  state.cachedContext = null;
  console.log(`[${MODULE_NAME}] Stopped`);
}

/**
 * Invalidate the freshness cache. Call from Pulse /reload so the next
 * request re-reads everything.
 */
export function invalidate(): void {
  state.cachedTelos = null;
  state.cachedContext = null;
  state.cacheExpiresAt = 0;
  // Also rewrite the on-disk render-path cache so the statusline reflects
  // the same view the next /api/freshness/summary caller will see.
  if (resolveStorageConfig().provider === "filesystem") refreshFileCache();
}

export function health(): { status: string; details?: Record<string, unknown> } {
  if (!state.running) return { status: "stopped" };
  const f = state.cachedTelos;
  const c = state.cachedContext;
  return {
    status: f && f.fileUpdated ? "healthy" : "degraded",
    details: {
      uptime_s: state.startedAt ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000) : 0,
      telos_file_updated: f?.fileUpdated?.toISOString() ?? null,
      telos_file_age_days: f?.fileAgeDays ?? null,
      telos_sections_total: f?.totalSections ?? 0,
      telos_sections_stale: f?.staleSections.length ?? 0,
      context_files_total: c?.total ?? 0,
      context_files_stale: c?.stale_count ?? 0,
      last_read_at: state.lastReadAt?.toISOString() ?? null,
    },
  };
}

/**
 * Pulse routes /api/telos/* here. Returns null on unhandled paths so the
 * outer router can fall through to the next module.
 */
export async function handleRequest(_req: Request, pathname: string): Promise<Response | null> {
  // Multi-file constitutional context (telos + 6 constitutional files)
  if (pathname.startsWith("/api/freshness")) {
    if (pathname === "/api/freshness/summary") {
      const c = await contextFreshness();
      return Response.json({
        total: c.total,
        fresh_count: c.fresh_count,
        stale_count: c.stale_count,
        overall_pct: c.overall_pct,
        overall_grade: c.overall_grade,
        most_stale: c.most_stale
          ? {
              slug: c.most_stale.slug,
              name: c.most_stale.name,
              age_days: c.most_stale.effective_age_days,
              threshold_days: c.most_stale.effective_threshold_days,
              reviewed_age_days: c.most_stale.effective_reviewed_age_days,
              pct: c.most_stale.pct,
              grade: c.most_stale.grade,
              why: c.most_stale.why,
            }
          : null,
        files: c.files.map((f) => ({
          slug: f.slug,
          name: f.name,
          age_days: f.effective_age_days,
          threshold_days: f.effective_threshold_days,
          reviewed_age_days: f.effective_reviewed_age_days,
          pct: f.pct,
          grade: f.grade,
          stale: f.stale,
          why: f.why,
        })),
      });
    }
    if (pathname === "/api/freshness") {
      return Response.json(await contextFreshness());
    }
    return null;
  }

  // Per-section TELOS routes (the original freshness surface)
  if (!pathname.startsWith("/api/telos")) return null;

  if (pathname === "/api/telos/freshness/summary") {
    const f = await freshness();
    const top = f.staleSections[0];
    return Response.json({
      file_updated: f.fileUpdated?.toISOString() ?? null,
      file_age_days: f.fileAgeDays,
      total: f.totalSections,
      stale_count: f.staleSections.length,
      most_stale_section: top
        ? { name: top.name, slug: top.slug, age_days: top.ageDays, threshold_days: top.thresholdDays }
        : null,
    });
  }
  if (pathname === "/api/telos/freshness/stale") {
    const f = await freshness();
    return Response.json({ count: f.staleSections.length, sections: f.staleSections });
  }
  if (pathname === "/api/telos/freshness") {
    return Response.json(await freshness());
  }
  if (pathname === "/api/telos/health") {
    return Response.json(health());
  }
  return null;
}
