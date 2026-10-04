LifeOS Notion-Backed Hermes Coach — Implementation Spec
1. Goal
Adapt `danielmiessler/LifeOS` so it can run as the coaching / intent layer for a native Hermes installation on Debian while using Notion as the canonical source of personal LifeOS state.
The target architecture is:
```text
Notion
  = canonical personal data store
    - identity
    - TELOS
    - goals
    - current state
    - projects
    - contacts
    - journal / reviews
    - knowledge
    - ideas

LifeOS
  = coaching logic + schemas + Current → Ideal State model
    - TELOS semantics
    - skills
    - ISA / planning logic
    - review logic
    - coaching doctrine
    - storage abstraction

Hermes
  = persistent agent runtime / interface
    - dedicated `coach` profile
    - SOUL.md
    - chat / voice / gateway / cron
    - local/cloud model routing
    - sessions
    - operational runtime state

Debian
  = deployment and orchestration target
    - native Hermes install
    - LifeOS checkout
    - environment secrets
    - local model endpoints
    - service management
```
LifeOS MUST remain compatible with its existing filesystem-backed mode.
Notion support MUST be opt-in.
The implementation MUST NOT require patching Hermes core.
---
2. Non-goals
Do not:
remove the existing filesystem-backed LifeOS storage mode;
force Notion on upstream users;
hard-code user-specific Notion IDs, API tokens, Debian paths, hostnames, model URLs, or usernames;
commit secrets;
replace Hermes with LifeOS;
duplicate personal LifeOS state into persistent local markdown when `provider = "notion"`;
silently let Hermes build a competing long-term personal profile when the coach profile is configured for Notion-backed canonical state;
modify the upstream Hermes source tree unless a hard blocker is discovered and documented;
introduce a database unless absolutely necessary;
redesign unrelated LifeOS subsystems.
---
3. Core Design Principle
Separate:
```text
SYSTEM / METHOD
from
PERSONAL / STATE
```
Local persistent content may contain:
LifeOS system code;
LifeOS skills;
coaching doctrine;
security policy;
Notion adapter code;
generic schemas;
generated non-personal Hermes configuration;
operational logs;
Hermes session/runtime data.
Notion is canonical for:
principal identity;
personal TELOS;
mission;
goals;
beliefs;
strategies;
current state;
projects;
contacts;
journal;
reviews;
personal knowledge;
ideas;
curated personal memory.
When Notion mode is enabled, the system MUST NOT depend on a persistent local `LIFEOS/USER/` mirror containing those personal values.
---
4. Preserve Existing Behavior
The default behavior must remain:
```toml
[storage]
provider = "filesystem"
```
Existing LifeOS installs that do not configure a storage provider MUST behave as they do today.
All new interfaces should be introduced behind compatibility layers where possible.
Acceptance criterion:
> Running existing tests and an existing filesystem-backed install must not require Notion credentials and must not materially change behavior.
---
5. Storage Provider Abstraction
Introduce a storage abstraction for canonical personal LifeOS data.
Suggested location:
```text
LIFEOS/
  STORAGE/
    LifeOSStore.ts
    FilesystemStore.ts
    NotionStore.ts
    StoreFactory.ts
    types.ts
    errors.ts
```
Naming may be adjusted to fit the repository's current conventions.
5.1 Required interface
Create a stable typed interface approximately equivalent to:
```ts
interface LifeOSStore {
  getDocument(key: LifeOSDocumentKey): Promise<LifeOSDocument | null>;

  queryCollection(
    key: LifeOSCollectionKey,
    query?: LifeOSQuery,
  ): Promise<LifeOSRecord[]>;

  getRecord(
    key: LifeOSCollectionKey,
    id: string,
  ): Promise<LifeOSRecord | null>;

  createRecord(
    key: LifeOSCollectionKey,
    value: LifeOSRecordInput,
  ): Promise<LifeOSRecord>;

  updateRecord(
    key: LifeOSCollectionKey,
    id: string,
    patch: LifeOSRecordPatch,
  ): Promise<LifeOSRecord>;

  appendToDocument(
    key: LifeOSDocumentKey,
    content: LifeOSContent,
  ): Promise<void>;

  healthCheck(): Promise<LifeOSStoreHealth>;
}
```
The exact type system should follow the repo's established TypeScript style.
5.2 FilesystemStore
Wrap the existing file-based behavior.
Do not rewrite the entire codebase immediately.
Prefer incremental migration:
```text
existing direct file access
    ↓
small storage helper
    ↓
LifeOSStore
```
Where practical, preserve existing paths and semantics.
5.3 NotionStore
Implement a provider that maps LifeOS concepts to Notion pages / data sources.
Requirements:
authenticate via environment variable;
support explicit mapping by configuration;
support page body retrieval through recursive block traversal;
support pagination;
normalize Notion blocks into a markdown/text representation suitable for model context;
preserve Notion record IDs for updates;
handle API errors deterministically;
apply bounded retries for transient failures;
apply request timeouts;
redact tokens and authorization headers from logs;
avoid leaking API tokens into model-visible tool output.
---
6. Configuration
Add provider configuration to LifeOS config.
Example:
```toml
[storage]
provider = "notion"

[notion]
root_page_id = "${NOTION_LIFEOS_ROOT_PAGE_ID}"
```
Environment:
```bash
NOTION_API_KEY=...
NOTION_LIFEOS_ROOT_PAGE_ID=...
```
Optional explicit mapping should be supported for installations that do not follow the expected Notion page titles.
Example:
```toml
[notion.documents]
principal_identity = "..."
da_identity = "..."
mission = "..."
beliefs = "..."
strategies = "..."
writing_style = "..."

[notion.collections]
goals = "..."
projects = "..."
contacts = "..."
current_state = "..."
journal = "..."
knowledge = "..."
ideas = "..."
```
Do not require secrets in TOML.
Environment interpolation must fail closed if a required secret is missing.
---
7. Canonical LifeOS → Notion Model
Support at least the following logical mappings.
Documents
```text
principal_identity
da_identity
principal_telos
mission
beliefs
strategies
writing_style
definitions
canonical_content
```
Collections
```text
goals
projects
contacts
current_state
journal
knowledge
ideas
reviews
```
Do not couple the storage interface to Notion terminology.
LifeOS code should ask for `goals`, not "Notion database X".
---
8. Hermes Integration
LifeOS already contains Hermes sidecar integration.
Adapt it for a dedicated coach profile and Notion-backed personal state.
Target profile:
```text
coach
```
Do not patch Hermes core.
8.1 Mount behavior
Extend the existing Hermes mount flow so it can target a dedicated profile.
Suggested CLI shape:
```bash
bun LIFEOS/HERMES/Mount.ts \
  --profile coach \
  --storage-provider notion
```
Exact flags may differ if the repo already has a better configuration mechanism.
The mount should:
locate the intended Hermes profile;
render / update `SOUL.md`;
install / update the LifeOS guard plugin;
mount LifeOS skills;
patch only the intended profile's config;
preserve unrelated user settings;
configure writable Hermes workspace paths;
verify the selected LifeOS storage provider;
run an install health check;
provide a `--check` mode that reports drift without modifying files.
8.2 SOUL.md changes
In Notion mode, persistent `SOUL.md` MUST contain:
LifeOS constitution;
coach identity / behavior;
Current → Ideal State methodology;
security rules;
write authority policy;
Notion canonical-source rule;
skill routing instructions.
It MUST NOT persist the full personal:
identity;
TELOS;
goals;
projects;
contacts;
journal;
personal memory.
Those must be fetched at runtime.
8.3 Runtime context
Introduce a runtime context loader for the coach.
It should fetch only the relevant personal context.
Suggested API:
```ts
buildCoachContext({
  request,
  session,
  provider,
})
```
Possible context categories:
```text
principal identity
relevant TELOS
active goals
relevant projects
current state
relevant contacts
recent journal/review signals
relevant knowledge/memory
```
Do not load the entire Notion LifeOS on every turn.
Use bounded, deterministic context selection.
---
9. Hermes Native Personal Memory
The coach architecture treats Notion as canonical personal state.
Provide deployment guidance / generated configuration so the coach profile does not create a competing personal-memory source of truth.
If the installed Hermes version supports:
```yaml
memory:
  memory_enabled: false
  user_profile_enabled: false
```
configure those for the `coach` profile.
If the config schema differs, detect it and adapt without breaking the profile.
Do not remove Hermes operational session/runtime storage.
---
10. Coach Behavior
Add a LifeOS coach skill or profile layer.
Suggested location:
```text
skills/
  LifeCoach/
    SKILL.md
    Workflows/
      Coach.md
      DailyReview.md
      WeeklyReview.md
      DecisionReview.md
      Capture.md
```
The coach should follow this loop:
```text
request
  ↓
identify relevant LifeOS domain
  ↓
fetch CURRENT STATE from canonical store
  ↓
fetch relevant IDEAL STATE / TELOS
  ↓
identify gap
  ↓
identify constraint
  ↓
select smallest high-leverage intervention
  ↓
recommend / act
  ↓
collect evidence
  ↓
update state according to write policy
```
The coach must distinguish:
```text
observation
inference
recommendation
canonical state
```
It must not silently convert inference into canonical state.
---
11. Write Authority Model
Implement a write policy.
Auto-write
Examples:
journal entries;
direct user-provided observations;
completion evidence;
measurements;
routine current-state updates;
daily review outcomes when they restate explicit user input.
Propose-first
Examples:
project priority changes;
goal status changes;
new plans;
new habits;
inferred blockers;
revised timelines.
Explicit approval required
Examples:
principal identity;
mission;
beliefs;
core strategies;
major goals;
interpretations about relationships;
destructive deletion of canonical personal data.
Represent the write class explicitly in code.
Do not rely only on prompt instructions for destructive/high-authority mutations.
---
12. Cortex / Memory Adaptation
LifeOS currently has filesystem-centric memory behavior.
Refactor the parts that represent canonical personal state so they can target `LifeOSStore`.
Likely areas to inspect include:
```text
MemorySystem.ts
MemoryWriter.ts
MemoryTypes.ts
MemoryReviewer.ts
DerivedSync.ts
Hermes RenderSoul / Mount logic
USER / TELOS / PROJECTS readers
Pulse APIs that directly traverse USER/
install/setup detection
```
Do not blindly rewrite all observability or ephemeral caches.
Keep ephemeral operational state local if it is not part of the user's canonical LifeOS.
Examples that may remain local:
```text
temporary cache
health state
observability JSONL
retry state
session state
tool events
performance metrics
```
---
13. Derived Content
Any generated summaries of canonical Notion state must be treated as derived, disposable data.
They MUST NOT become an independent source of truth.
If a local cache is introduced for performance:
it must be optional;
it must be explicitly marked derived;
it must be safe to delete;
it must have a TTL or source revision marker;
it must not be committed;
it must never be preferred over fresher Notion data when correctness matters.
Prefer no persistent personal cache in the first implementation.
---
14. Optional Transitional Compatibility Mode
If direct migration of all filesystem consumers is too large for the first patch, an optional compatibility layer may render Notion content into a RAM-only temporary tree.
Allowed path style:
```text
/run/user/<uid>/lifeos-user/
```
or another tmpfs-backed location.
Properties:
no SSD persistence;
no Git tracking;
rebuilt from Notion;
destroyed safely;
clearly labeled transitional.
This is a fallback only.
The final architecture should prefer direct provider-backed access.
---
15. Notion Security
Secrets must never enter model context.
Requirements:
`NOTION_API_KEY` read only by deterministic code;
never echo token values;
never include authorization headers in errors;
never include `.env` content in model-facing results;
sanitize API error objects;
restrict mutations to configured LifeOS pages/data sources;
reject arbitrary Notion page IDs supplied by untrusted content unless explicitly allowed;
preserve LifeOS/Hermes prompt-injection safeguards for fetched external content.
The model receives returned LifeOS data, never credentials.
---
16. Debian Deployment
The repository should contain a deployment guide or script, but no machine-specific secrets.
Suggested deployment:
```text
Debian native Hermes
    +
LifeOS checkout
    +
coach Hermes profile
    +
Notion environment
```
Provide:
```text
docs/HERMES_NOTION_COACH.md
```
or equivalent.
Document:
prerequisites;
clone / pull;
Bun dependency setup;
Hermes profile setup;
LifeOS Mount command;
`.env` variables;
provider health check;
dry-run / `--check`;
first interactive coach smoke test;
cron setup;
upgrade procedure;
rollback procedure.
Do not expose new network ports.
Do not require Docker.
---
17. Cron / Scheduled Coaching
Provide example schedules, but do not force-install them without explicit deployment action.
Suggested jobs:
```text
Morning review
Midday alignment check
Daily review
Weekly review
```
Each job should:
start a fresh bounded coach run;
query current Notion state;
write only according to mutation policy;
be safe when Notion is unavailable;
avoid duplicate journal/review entries;
log outcomes without logging secrets.
---
18. CLI / Health Commands
Provide CLI-accessible diagnostics.
Examples:
```bash
lifeos storage status
lifeos storage check
lifeos notion discover
lifeos notion validate-mapping
lifeos coach context --dry-run
lifeos hermes mount --profile coach --check
```
Use the repository's existing CLI conventions if available.
Diagnostics should report:
provider selected;
authentication success/failure;
configured logical mappings;
inaccessible mappings;
Hermes profile status;
SOUL drift;
guard/plugin status;
Notion write test status where safe.
Do not print secrets.
---
19. Testing
Unit tests
Add tests for:
StoreFactory provider selection;
filesystem compatibility;
Notion page/block normalization;
recursive block traversal;
pagination;
mapping resolution;
retries/timeouts;
sanitized errors;
mutation authority;
missing-token failure;
Hermes SOUL rendering in notion mode;
no personal data embedded into persistent SOUL in notion mode;
filesystem mode unchanged.
Fixture-based tests
Use local JSON fixtures for Notion API responses.
Tests must not require real Notion access by default.
Integration tests
Add an opt-in live Notion integration test controlled by environment variables.
Example:
```bash
LIFEOS_LIVE_NOTION_TEST=1
```
It should:
authenticate;
read a configured test page;
query one configured collection;
optionally create/update a dedicated test record;
clean up or mark test content clearly;
avoid touching production canonical data unless explicitly configured.
Hermes smoke test
Verify:
target profile exists or is created safely;
mount modifies only intended profile;
`SOUL.md` contains generic coach constitution;
personal Notion values are absent from persisted SOUL;
LifeOS skills are visible;
guard is enabled;
runtime context fetch works;
unrelated Hermes profiles are untouched.
---
20. Migration Safety
Do not delete the user's existing `LIFEOS/USER/` tree during initial migration.
Provide an explicit migration command or documented process.
Suggested flow:
```text
filesystem mode
    ↓
validate Notion mapping
    ↓
compare important canonical values
    ↓
switch provider to notion
    ↓
run coach smoke tests
    ↓
archive old local USER tree
```
Deletion must be an explicit later action.
---
21. Upstream Compatibility Strategy
Keep the patch maintainable against upstream LifeOS.
Preferences:
additive provider abstraction;
minimal invasive changes;
no hard-coded principal-specific logic;
no fork-only assumptions in unrelated files;
isolated Notion code;
strong tests around touched upstream behavior;
document all fork-specific changes.
Create:
```text
FORK_NOTES.md
```
or equivalent, listing:
changed upstream files;
why;
merge-conflict risk;
new files;
deployment differences.
---
22. Suggested Implementation Phases
Phase 1 — Discovery and tests
inspect current LifeOS filesystem assumptions;
inspect Hermes Mount / RenderSoul implementation;
identify all direct canonical `USER/` readers/writers;
add characterization tests before refactoring;
produce implementation map.
Phase 2 — Store abstraction
implement `LifeOSStore`;
wrap filesystem provider;
preserve default behavior;
migrate a minimal set of reads first.
Phase 3 — Notion provider
auth;
config;
page / collection mapping;
recursive page reads;
query;
create/update;
normalization;
health checks;
tests.
Phase 4 — Hermes Notion coach mode
coach profile support;
non-personal persistent SOUL;
runtime context loader;
coach skill;
memory/profile conflict prevention;
mount health checks.
Phase 5 — Memory / derived consumers
migrate Cortex canonical writes;
migrate DerivedSync inputs;
migrate relevant Pulse/user APIs;
preserve local ephemeral caches.
Phase 6 — Debian deployment
deployment guide;
profile bootstrap;
env template;
cron examples;
live smoke-test script;
rollback path.
---
23. Deliverables
Required:
```text
1. Storage provider abstraction
2. FilesystemStore preserving current behavior
3. NotionStore
4. Notion config schema
5. Hermes coach profile support
6. Notion-safe RenderSoul / Mount behavior
7. Runtime coach context loader
8. Coach skill/workflows
9. Write authority enforcement
10. Tests
11. Debian deployment docs
12. Example env/config files without secrets
13. FORK_NOTES.md
14. Migration guide
```
---
24. Definition of Done
The work is done when all of the following are true:
LifeOS still works normally with filesystem storage by default.
`provider = "notion"` works without a persistent personal `USER/` mirror.
Hermes core is not forked or patched.
A dedicated `coach` Hermes profile can be mounted.
Persistent `SOUL.md` contains coaching method and rules, not canonical personal Notion content.
Personal context is retrieved dynamically from Notion.
Notion is the canonical store for selected personal LifeOS domains.
Hermes's coach profile does not maintain a competing canonical personal memory.
High-authority personal state changes require explicit approval.
Secrets never reach model context or logs.
Existing unrelated Hermes profiles remain untouched.
Tests pass.
Live Notion smoke test passes when explicitly enabled.
Debian deployment can be performed with `git pull` + configuration, without hand-patching installed source files.
Upgrade and rollback procedures are documented.
---
25. First Implementation Constraint
Do not attempt a giant rewrite in the first commit.
Start by:
reading the repo architecture;
tracing the current Hermes mount path;
tracing canonical USER / TELOS / PROJECTS / memory reads and writes;
adding characterization tests;
introducing the storage abstraction with filesystem behavior unchanged;
then add Notion as a second provider.
Prefer a sequence of small reviewable commits.
