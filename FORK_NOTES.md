# Upstream compatibility notes

## Additive files

- `LIFEOS/STORAGE/`: provider-neutral contract, legacy filesystem adapter,
  isolated Notion adapter, configuration, sanitized errors, and tests.
- `LIFEOS/COACH/`: bounded runtime context selection and deterministic mutation
  authority with short-lived opaque proposals.
- `LIFEOS/TOOLS/LifeosCoach.ts`: the Hermes-facing logical-resource CLI.
- `LIFEOS/TOOLS/HermesNotionSmoke.ts`: non-destructive Debian/profile smoke checks.
- `skills/LifeCoach/`: coaching and review workflows.
- `config/`: secret-free examples.
- `docs/HERMES_NOTION_COACH.md` and `docs/IMPLEMENTATION_MAP.md`: deployment,
  migration, and architecture audit.

These additions should have low merge-conflict risk. New logical resources are
extended in `STORAGE/types.ts`; new Notion transport behavior stays in
`NotionStore.ts`.

## Modified upstream files

- `HERMES/RenderSoul.ts`: adds a separate non-personal coach constitution. The
  existing filesystem renderer remains unchanged and default. Conflict risk is
  low-to-medium if upstream changes the renderer exports.
- `HERMES/Mount.ts`: adds selected-profile resolution, provider health checks,
  generic Notion soul selection, and defensive coach memory flags. Conflict risk
  is medium because Mount is an upstream integration point. No Hermes source is
  patched.
- `TOOLS/Cortex.ts`, `MemorySystem.ts`, `MemoryWriter.ts`,
  `MemoryReviewer.ts`, and `DerivedSync.ts`: route canonical memory and derived
  inputs through the provider while retaining operational queues/logs locally.
- Pulse `projects`, `memory`, `user-index`, morning brief, tab freshness,
  observability canonical views, and setup modules: use provider-backed
  canonical reads; their health state, watcher/index cache, and reviewer
  observability remain local.
- `Tools/ScaffoldUser.ts` (source and deployed skill copy): skip USER markdown
  scaffolding in Notion mode and require a successful provider health check.

Hermes extensions belong in Mount/profile configuration and the existing guard
plugin. Notion extensions belong behind `LifeOSStore`; business logic must use
logical keys rather than page or data-source IDs. Direct legacy `USER` readers can
be migrated incrementally without changing filesystem defaults.
