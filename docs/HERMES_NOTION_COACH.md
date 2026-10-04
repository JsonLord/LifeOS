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
   unused mappings, and enter the integration-owned page/database IDs.
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

For a read-only live adapter smoke test:

```bash
LIFEOS_LIVE_NOTION_TEST=1 bun test LifeOS/install/LIFEOS/STORAGE/LiveNotion.test.ts
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
