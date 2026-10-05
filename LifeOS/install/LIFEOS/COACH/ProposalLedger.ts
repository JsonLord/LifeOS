import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LifeOSCollectionKey, LifeOSDocumentKey, LifeOSRecordInput, LifeOSRecordPatch } from "../STORAGE/types.ts";
import { assertSufficientAuthority, mutationAuthority, type MutationAuthority, type MutationKind } from "./MutationPolicy.ts";

export type ProposedOperation =
  | { operation: "append_document"; key: LifeOSDocumentKey; content: string }
  | { operation: "create_record"; key: LifeOSCollectionKey; value: LifeOSRecordInput }
  | { operation: "update_record"; key: LifeOSCollectionKey; recordId: string; patch: LifeOSRecordPatch }
  | { operation: "append_record"; key: LifeOSCollectionKey; recordId: string; content: string };
export interface MutationProposal { id: string; digest: string; kind: MutationKind; authority: Exclude<ReturnType<typeof mutationAuthority>, "auto_write">; createdAt: string; expiresAt: string; request: ProposedOperation }

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function proposalDigest(kind: MutationKind, request: ProposedOperation): string { return createHash("sha256").update(stable({ kind, request })).digest("hex"); }
export function operationAuthority(request: ProposedOperation): MutationAuthority {
  if (request.operation === "append_document") return "explicit_approval";
  if (request.key === "journal" || request.key === "current_state") return "auto_write";
  if (request.key === "contacts") return "explicit_approval";
  return "propose_first";
}

/** Pending proposals are short-lived operational state, mode 0600, and deleted after execution. */
export class ProposalLedger {
  constructor(private readonly directory: string, private readonly ttlMs = 15 * 60_000) {}
  async propose(kind: MutationKind, request: ProposedOperation): Promise<Pick<MutationProposal, "id" | "digest" | "authority" | "expiresAt">> {
    const authority = mutationAuthority(kind); if (authority === "auto_write") throw new Error("Auto-write mutations do not require a proposal");
    assertSufficientAuthority(kind, operationAuthority(request));
    const now = Date.now(); const proposal: MutationProposal = { id: randomUUID(), digest: proposalDigest(kind, request), kind, authority, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + this.ttlMs).toISOString(), request };
    await mkdir(this.directory, { recursive: true, mode: 0o700 }); const path = this.path(proposal.id); await writeFile(path, JSON.stringify(proposal), { mode: 0o600 }); await chmod(path, 0o600);
    return { id: proposal.id, digest: proposal.digest, authority: proposal.authority, expiresAt: proposal.expiresAt };
  }
  async load(id: string): Promise<MutationProposal> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid proposal ID");
    const proposal = JSON.parse(await readFile(this.path(id), "utf8")) as MutationProposal;
    if (proposal.id !== id || proposal.digest !== proposalDigest(proposal.kind, proposal.request)) throw new Error("Proposal integrity check failed");
    if (Date.parse(proposal.expiresAt) <= Date.now()) { await this.discard(id); throw new Error("Proposal expired"); }
    return proposal;
  }
  async discard(id: string) { await rm(this.path(id), { force: true }); }
  private path(id: string) { return join(this.directory, `${id}.json`); }
}
