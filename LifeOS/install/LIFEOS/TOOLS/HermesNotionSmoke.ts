#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveHermesProfileHome } from "../HERMES/Mount.ts";
import { resolveStorageConfig } from "../STORAGE/StorageConfig.ts";
import { createLifeOSStore } from "../STORAGE/StoreFactory.ts";
import { validateStorageMappings } from "../STORAGE/CanonicalState.ts";
import { buildCoachContext } from "../COACH/CoachContext.ts";
import { ProposalLedger } from "../COACH/ProposalLedger.ts";

export async function runHermesNotionSmoke(options: { profile?: string; hermesHome?: string; proposalDir?: string } = {}) {
  const profile = options.profile ?? "coach"; const base = options.hermesHome ?? process.env.HERMES_HOME ?? join(homedir(), ".hermes"); const profileHome = resolveHermesProfileHome(base, profile);
  const storage = resolveStorageConfig({ provider: "notion" }); const store = createLifeOSStore(storage);
  const soulPath = join(profileHome, "SOUL.md"); const configPath = join(profileHome, "config.yaml"); const guardPath = join(profileHome, "plugins", "lifeos", "guard.py");
  const soul = existsSync(soulPath) ? await readFile(soulPath, "utf8") : ""; const config = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const health = await store.healthCheck(); const mappings = await validateStorageMappings(storage, store); const context = await buildCoachContext({ request: "review current goals and projects", store, maxRecords: 2 });
  const proposalDir = options.proposalDir ?? join(profileHome, "operational", "smoke-proposals"); const ledger = new ProposalLedger(proposalDir, 60_000); const proposal = await ledger.propose("goal_status", { operation: "update_record", key: "goals", recordId: "smoke-placeholder-never-executed", patch: { properties: {} } }); await ledger.discard(proposal.id); await rm(proposalDir, { recursive: true, force: true });
  const checks = {
    profile: existsSync(profileHome), genericSoul: soul.includes("LifeOS Coach Constitution") && soul.includes("Current → Ideal State") && !soul.includes("Who I'm talking to"),
    guard: existsSync(guardPath) && /(?:^|\n)\s*-\s*lifeos\s*(?:\n|$)/.test(config), storageHealth: health.ok, mappings: mappings.ok,
    boundedContext: Object.keys(context.collections).length <= 3 && Object.values(context.collections).every((records) => (records?.length ?? 0) <= 2),
    proposal: Boolean(proposal.id && proposal.digest), approvalPath: existsSync(join(import.meta.dir, "LifeosCoach.ts")), pulseProviderMode: storage.provider === "notion",
    localUserMirrorRequired: false, localUserMirrorPresent: existsSync(join(profileHome, "LIFEOS", "USER")),
  };
  const ok = checks.profile && checks.genericSoul && checks.guard && checks.storageHealth && checks.mappings && checks.boundedContext && checks.proposal && checks.approvalPath && checks.pulseProviderMode && checks.localUserMirrorRequired === false;
  return { ok, profile, provider: store.provider, checks, mappingResources: mappings.resources };
}

if (import.meta.main) { const result = await runHermesNotionSmoke(); console.log(JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 1); }
