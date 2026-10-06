# Notion/Hermes coach implementation map

This map records the pre-refactor storage audit. It deliberately separates the
personal source of truth from files which merely operate on it.

| Class | Existing examples | Initial treatment |
| --- | --- | --- |
| Canonical personal state | `USER/PRINCIPAL`, `USER/DIGITAL_ASSISTANT`, `USER/TELOS`, `PROJECTS.md`, `CONTACTS.md`, curated knowledge and ideas | Address through `LifeOSStore`; filesystem remains the default and Notion is opt-in. |
| Derived personal state | generated TELOS summaries, Pulse projections, indexes and review summaries | Keep disposable; provider-backed readers should be adopted incrementally. Never treat these as canonical. |
| Ephemeral operational state | Cortex observations, retry/health state, tool events, temporary caches, metrics | Keep local. These are not migrated merely because they mention a person. |
| System state | skills, constitution, schemas, Hermes guard policy, installation metadata | Keep in the checkout/profile and upstream-compatible. |

## Consumer map

- `HERMES/RenderSoul.ts` reads identity, memory, TELOS, and projects. Filesystem
  rendering is characterized and retained; Notion rendering emits only the
  generic coach constitution and fetches personal context at runtime.
- `HERMES/Mount.ts` owns the sidecar soul, plugin, skill mount, approval policy,
  and write sandbox. Profile selection must scope every mutation.
- `TOOLS/MemorySystem.ts`, `MemoryWriter.ts`, `MemoryReviewer.ts`, and
  `Cortex.ts` mix canonical proposals with local operational queues. Only
  approved canonical writes belong behind the store; queues and telemetry stay
  local.
- `TOOLS/DerivedSync.ts` creates projections and therefore remains a derived
  consumer, never a source of truth.
- Pulse's `telos`, `projects`, `user-index`, and memory modules directly walk
  `USER/`; these are migration candidates. Observability output and health
  endpoints remain local operational state.
- Setup/scaffolding (`ScaffoldUser.ts`, `LinkUser.ts`, `InstallEngine.ts`) is the
  filesystem bootstrap path. Notion mode must not invoke it as a prerequisite.

The initial boundary is additive: new code uses the provider directly while
legacy filesystem consumers continue to work. This avoids a broad path rewrite
and leaves small, independently reviewable migration points.

## Phase 2 canonical-access migration

| File | Function | Previous path | Classification | Store method | Status |
| --- | --- | --- | --- | --- | --- |
| `TOOLS/Cortex.ts` | `runCortex`, `loadStoreCanonicalRecords` | `LIFEOS/MEMORY/KNOWLEDGE` corpus | canonical personal state | `queryCollection(knowledge/ideas/journal)` | Migrated for Notion; filesystem corpus compatibility retained. |
| `TOOLS/MemorySystem.ts` | `addCanonical` | resolved `USER`/`MEMORY` paths | canonical personal state | `getDocument`, `replaceDocument`, `createRecord` | Migrated; proposal queue remains local. |
| `TOOLS/MemoryWriter.ts` | `setStoreEntries` | `PRINCIPAL_MEMORY.md`, `DA_MEMORY.md` | canonical personal state | `getDocument`, `replaceDocument` | Migrated; filesystem atomic writer retained for compatibility/smoke tooling. |
| `TOOLS/MemoryReviewer.ts` | `readCurrentMemorySnapshot`, `dispatchItems` | two hot-layer memory files | canonical reads/writes | document reads plus `addCanonical` | Migrated; transcript capture and pending proposals remain local operational state. |
| `TOOLS/DerivedSync.ts` | `getDerivedCanonicalHashes`, `runSync` | TELOS, identity, projects, contacts, memory | derived input from canonical state | provider-neutral document/collection reads | Migrated in Notion mode; generated hashes/logs remain local and disposable. |
| `PULSE/modules/projects.ts` | `readProjects` | `USER/PROJECTS.md` | canonical personal state | bounded hydrated `queryCollection(projects)` | Migrated. |
| `PULSE/modules/memory.ts` | `buildSnapshot` | hot-layer memory files | canonical personal state | `getDocument(principal_memory/da_memory)` | Migrated; health, cadence, runs, and proposals stay local. |
| `PULSE/modules/user-index.ts` | `buildProviderIndex`, `start` | recursive `USER/` walk | derived index over canonical state | bounded document/collection reads | Migrated for Notion; filesystem watcher retained. |
| `PULSE/lib/lifeos-context.ts` | `buildLifeosContextBlock` | identity, TELOS, projects, hot memory, knowledge files | canonical personal state | bounded document/collection reads | Migrated for all providers. |
| `PULSE/modules/telos.ts` | `readProviderFreshness` | TELOS/context mtimes | canonical revision metadata | `getDocumentRevision`, `getCollectionRevision` | Provider-backed mode migrated; filesystem freshness parser retained. |
| `PULSE/modules/hermes.ts` | canonical source manifest/previews | identity, TELOS, memory, projects paths | canonical personal diagnostics | logical document/collection reads and revisions | Migrated; provider-backed writes fail closed. |
| `PULSE/edit/edit-handler.ts` | `applyEdit` | arbitrary allow-listed USER file edits | canonical mutation boundary | none | Filesystem-compatible; provider-backed mode refuses and routes operators to trusted commands. |
| `PULSE/checks/life-morning-brief.ts` | `buildProviderMorningBrief` | TELOS goals/sparks/current files | bounded canonical personal read | document and hydrated collection reads | Migrated for provider-backed mode; legacy filesystem narration is unchanged. |
| `PULSE/modules/tab-freshness.ts` | `computeProviderTabFreshness` | canonical USER/TELOS mtimes | canonical revision metadata | document/collection revisions | Migrated; operational tabs retain local timestamps. |
| `PULSE/Observability/observability.ts` | `handleProviderCanonicalRequest` | identity/TELOS/project/knowledge files | canonical diagnostic read | bounded logical reads | Migrated for provider mode; local telemetry and health routes remain local. |
| `PULSE/setup.ts` | `readIdentity`, `main` | DA identity file prerequisite | setup canonical read/validation | `getDocument`, health, mapping revisions | Provider-backed setup validates mappings and does not scaffold personal markdown. |
| `Tools/ScaffoldUser.ts` | `validateSetupStorage`, `main` | unconditional USER template scaffold | setup/system state | `healthCheck` | Provider-aware: filesystem scaffolds, Notion validates and skips personal files. |

Intentionally local operations include Cortex/reviewer proposal queues,
observability JSONL, reviewer runs, DerivedSync hash/lock/log state, Pulse index
cache, health data, and filesystem compatibility/smoke routines. These are
ephemeral operational or derived/system state and are not canonical fallbacks.

Notion project diagnostics expose the canonical `projects` collection. The
legacy TELOS-project and retired-project groups remain visible as explicitly
unsupported projections because the current collection schema has no reliable,
provider-neutral discriminator for them. No inferred second source is created.

## Provider-backed derived jobs

`DerivedSync` now fails before advancing local hash state if any mapped canonical
read fails. In provider mode, identity, TELOS, and contacts changes run the
provider-aware deny-hash derivation. That tool reads its canonical privacy corpus
through `LifeOSStore` while retaining local network topology as operational input.
The legacy TELOS summary generator, `UpdateLifeosState`, and manifest AdapterCli
jobs remain filesystem-only because they consume or emit legacy path-shaped
artifacts. Logical current-state and project changes are recorded in hash state
but deliberately do not invoke those filesystem-only jobs.
