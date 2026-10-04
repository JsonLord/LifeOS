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
