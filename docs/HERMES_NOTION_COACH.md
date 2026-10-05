# Native Debian Hermes + Notion coach

This deployment is native: it requires no Docker container and exposes no new
network port. Hermes keeps sessions, cron, gateway state, and operational logs
locally; Notion is canonical only for mapped personal resources.

## Install and configure

1. Install Git and Bun on Debian, then install Hermes using its supported native
   installer. Clone this repository and run `bun install` in `LifeOS/install`.
2. Create the dedicated Hermes profile using the Hermes version's profile
   command. Its home must be `$HERMES_HOME/profiles/coach`; retain all other
   profiles. If profile creation is unavailable, create that directory and copy
   only a stock `config.yaml`—never another profile's state.
3. Copy `config/storage.example.toml` outside the checkout (for example into
   your service configuration directory). Set `provider = "notion"`, remove
   unused mappings, and enter integration-owned page IDs for documents and
   data-source IDs for collections. The adapter uses the current Notion
   `data_sources` API and sends `Notion-Version: 2026-03-11`.
4. Set `LIFEOS_STORAGE_CONFIG_PATH`, `NOTION_API_KEY`, and
   `NOTION_LIFEOS_ROOT_PAGE_ID` in a mode-0600 service environment or secret
   manager. Do not source, print, commit, or pass that file to the model.
   `config/notion.env.example` lists the names only.
5. Share each mapped page/database with the Notion integration. Use the least
   privilege required for the intended reads and writes.

No local `LIFEOS/USER` mirror is needed in Notion mode.

## Mount and health check

From the checkout:

```bash
bun LifeOS/install/LIFEOS/HERMES/Mount.ts --profile coach --storage-provider notion
bun LifeOS/install/LIFEOS/HERMES/Mount.ts --profile coach --storage-provider notion --check
```

Mount verifies the provider before writing, scopes changes to the coach profile,
installs the guard, exposes the LifeOS skills, writes a generic coach `SOUL.md`,
and preserves unrelated configuration. In Notion mode it disables Hermes's
personal long-term memory flags while retaining operational/session state. The
second command is read-only and exits nonzero on soul/config drift.

The coach profile defaults to its own writable
`$HERMES_HOME/profiles/coach/workspace`. Set `HERMES_WORKSPACE` only when an
explicit alternative is required. If `HERMES_HOME` already names
`.../profiles/coach`, Mount detects that and does not append the profile twice.

## Hermes-facing LifeOS commands

Hermes invokes the checked-in deterministic surface, not the Notion API:

```bash
bun LifeOS/install/LIFEOS/TOOLS/LifeosCoach.ts storage status
bun LifeOS/install/LIFEOS/TOOLS/LifeosCoach.ts storage validate
bun LifeOS/install/LIFEOS/TOOLS/LifeosCoach.ts context "review project priorities" --limit 10
bun LifeOS/install/LIFEOS/TOOLS/LifeosCoach.ts read mission
bun LifeOS/install/LIFEOS/TOOLS/LifeosCoach.ts query projects --limit 10
```

Logical resource keys are allow-listed. Queries hydrate only the selected
bounded records. Credentials and arbitrary Notion resources are not accepted.

For mutations, pipe a typed JSON request to `write` only for auto-write classes,
or to `propose` for higher-authority classes. `propose` returns an opaque ID and
digest; it does not mutate canonical state. A human operator must run the
following from an interactive trusted terminal and type the exact confirmation:

```bash
bun LifeOS/install/LIFEOS/TOOLS/LifeosCoach.ts approve <proposal-id>
```

Approval cannot be passed as a boolean, command argument, or piped model input.
Pending proposals are mode-0600, expire after 15 minutes, and are deleted after
execution. Notion body replacement is deliberately unsupported; callers must
use an explicit append operation rather than receiving false replacement
success.

Pulse freshness and Hermes source diagnostics use logical store revisions and
previews in Notion mode. They never reveal page/data-source IDs. Generic Pulse
filesystem editing is disabled for provider-managed canonical state; mutations
must use the commands above. The legacy TELOS-project and retired-project Pulse
groups are reported as unsupported in Notion mode until the projects collection
has an explicit provider-neutral projection field.

`storage validate` checks every required logical document and collection mapping,
its accessibility/type, and revision metadata. Output contains logical names and
status only, never provider IDs.

For the isolated live adapter integration suite, create a disposable test page
and test data source, share only those with the integration, then set all four
test-only variables. The suite refuses mutation if either fixture ID matches a
configured production mapping. It creates a clearly prefixed record and marks
it retired rather than deleting it:

```bash
LIFEOS_LIVE_NOTION_TEST=1 \
LIFEOS_NOTION_TEST_PAGE_ID='<test-page-id>' \
LIFEOS_NOTION_TEST_DATA_SOURCE_ID='<test-data-source-id>' \
LIFEOS_NOTION_TEST_TITLE_PROPERTY='Name' \
bun test LifeOS/install/LIFEOS/STORAGE/LiveNotion.test.ts
```

After mounting the coach profile, run the non-destructive host smoke command.
It checks the generic soul, guard, provider/mappings, bounded context, proposal
creation and approval-path availability, and Pulse provider mode. Its proposal
is discarded without execution:

```bash
bun LifeOS/install/LIFEOS/TOOLS/HermesNotionSmoke.ts
```

Then start an interactive coach session and ask it to summarize one mapped
current-state item. Confirm the answer comes from Notion and that the profile's
`SOUL.md` contains no personal value.

## Scheduled coaching

Use Hermes's native cron facility rather than system-wide shell jobs where
possible. Examples (adapt syntax to the installed Hermes release): morning
daily alignment, midday constraint check, evening review, and a weekly review.
Each job must start a fresh bounded coach run, be idempotent, stop safely if
Notion is unavailable, and apply the same mutation policy. Do not log prompts,
Notion bodies, or environment values. Schedules are examples only; Mount does
not install them.

## Upgrade

```bash
git pull --ff-only
cd LifeOS/install && bun install && bun test LIFEOS/STORAGE LIFEOS/COACH LIFEOS/HERMES
cd ../.. && bun LifeOS/install/LIFEOS/HERMES/Mount.ts --profile coach --storage-provider notion --check
# review drift, then rerun without --check
```

Back up only profile configuration and operational state before upgrading.
Notion remains the canonical personal backup boundary.

## Migration and rollback

Do not delete an existing `LIFEOS/USER` tree. First validate all mappings,
compare identity/TELOS/goals/projects, switch the provider, run the read-only
smoke test, then archive the old tree explicitly. It is not consulted in Notion
mode.

To roll back, check out the previous Git revision, restore the coach profile's
configuration backup, set `provider = "filesystem"` (or unset the provider),
and rerun Mount. Restore the archived `USER` tree before starting filesystem
mode. Never copy Notion content into `SOUL.md` as a rollback mechanism.

The steady-state server workflow is: `git pull`, update secrets/mappings if
needed, run Mount, and run `--check` plus the health smoke test. No TypeScript
files require hand editing.
