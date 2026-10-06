#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveHermesProfileHome } from "../HERMES/Mount.ts";

async function cli(args: string[], env: Record<string, string>, stdin?: string) {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "LifeosCoach.ts"), ...args], { env: { ...process.env, ...env }, stdin: stdin ? new Blob([stdin]) : undefined, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]); return { exit, stdout, stderr };
}

export async function runHermesNotionSmoke(options: { profile?: string; hermesHome?: string; proposalDir?: string } = {}) {
  const profile = options.profile ?? "coach"; const base = options.hermesHome ?? process.env.HERMES_HOME ?? join(homedir(), ".hermes"); const profileHome = resolveHermesProfileHome(base, profile);
  const soulPath = join(profileHome, "SOUL.md"); const configPath = join(profileHome, "config.yaml"); const guardPath = join(profileHome, "plugins", "lifeos", "guard.py");
  const soul = existsSync(soulPath) ? await readFile(soulPath, "utf8") : ""; const config = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const proposalDir = options.proposalDir ?? join(profileHome, "operational", "smoke-proposals"); const env = { LIFEOS_STORAGE_PROVIDER: "notion", LIFEOS_PROPOSAL_DIR: proposalDir };
  const [health, mappings, context, goals, projects, managed] = await Promise.all([cli(["storage", "status"], env), cli(["storage", "validate"], env), cli(["context", "review current goals and projects", "--limit", "2"], env), cli(["query", "goals", "--limit", "2"], env), cli(["query", "projects", "--limit", "2"], env), cli(["storage", "managed", "status"], env)]);
  const proposed = await cli(["propose"], env, JSON.stringify({ kind: "goal_status", request: { operation: "update_record", key: "goals", recordId: "smoke-placeholder-never-executed", patch: { properties: {} } } })); const proposal = proposed.exit === 0 ? JSON.parse(proposed.stdout) : {}; const approval = proposal.id ? await cli(["approve", proposal.id], env) : { exit: 0 }; await rm(proposalDir, { recursive: true, force: true });
  const checks = {
    profile: existsSync(profileHome), genericSoul: soul.includes("LifeOS Coach Constitution") && soul.includes("Current → Ideal State") && !soul.includes("Who I'm talking to"),
    guard: existsSync(guardPath) && /(?:^|\n)\s*-\s*lifeos\s*(?:\n|$)/.test(config), storageHealth: health.exit === 0, mappings: mappings.exit === 0 && JSON.parse(mappings.stdout).ok,
    boundedContext: context.exit === 0, boundedQueries: goals.exit === 0 && projects.exit === 0, managedMemoryReady: managed.exit === 0 && JSON.parse(managed.stdout).documents.every((item: any) => item.initialized),
    proposal: Boolean(proposal.id && proposal.digest), noninteractiveApprovalRefused: approval.exit !== 0, approvalPath: existsSync(join(import.meta.dir, "LifeosCoach.ts")), pulseProviderMode: true,
    localUserMirrorRequired: false, localUserMirrorPresent: existsSync(join(profileHome, "LIFEOS", "USER")),
  };
  const ok = checks.profile && checks.genericSoul && checks.guard && checks.storageHealth && checks.mappings && checks.boundedContext && checks.boundedQueries && checks.managedMemoryReady && checks.proposal && checks.noninteractiveApprovalRefused && checks.approvalPath && checks.pulseProviderMode && checks.localUserMirrorRequired === false;
  return { ok, profile, provider: "notion", checks };
}

if (import.meta.main) { const result = await runHermesNotionSmoke(); console.log(JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 1); }
