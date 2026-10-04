#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildCoachContext } from "../COACH/CoachContext.ts";
import { operationAuthority, ProposalLedger, type ProposedOperation } from "../COACH/ProposalLedger.ts";
import { assertAutoWritable, assertSufficientAuthority, type MutationKind } from "../COACH/MutationPolicy.ts";
import { createLifeOSStore } from "../STORAGE/StoreFactory.ts";
import { resolveStorageConfig } from "../STORAGE/StorageConfig.ts";
import { COLLECTION_KEYS, DOCUMENT_KEYS, type LifeOSCollectionKey, type LifeOSDocumentKey } from "../STORAGE/types.ts";

const args = process.argv.slice(2); const command = args[0];
const value = (flag: string) => { const at = args.indexOf(flag); return at < 0 ? undefined : args[at + 1]; };
const proposalDir = process.env.LIFEOS_PROPOSAL_DIR ?? join(process.env.HERMES_HOME ?? join(homedir(), ".hermes"), "operational", "lifeos-proposals");
const output = (data: unknown) => process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
async function stdinJson(): Promise<any> { const text = await Bun.stdin.text(); if (!text.trim()) throw new Error("JSON input is required on stdin"); return JSON.parse(text); }
function documentKey(raw?: string): LifeOSDocumentKey { if (!DOCUMENT_KEYS.includes(raw as any)) throw new Error("Unknown logical document key"); return raw as LifeOSDocumentKey; }
function collectionKey(raw?: string): LifeOSCollectionKey { if (!COLLECTION_KEYS.includes(raw as any)) throw new Error("Unknown logical collection key"); return raw as LifeOSCollectionKey; }
async function execute(request: ProposedOperation, store: ReturnType<typeof createLifeOSStore>): Promise<unknown> {
  switch (request.operation) {
    case "append_document": return store.appendToDocument(documentKey(request.key), request.content);
    case "create_record": return store.createRecord(collectionKey(request.key), request.value);
    case "update_record": return store.updateRecord(collectionKey(request.key), request.recordId, request.patch);
    case "append_record": return store.appendToRecord(collectionKey(request.key), request.recordId, request.content);
  }
}

export async function runCoachCli(): Promise<void> {
  const store = createLifeOSStore(resolveStorageConfig());
  switch (command) {
    case "storage": if (args[1] !== "status") throw new Error("Usage: storage status"); output(await store.healthCheck()); return;
    case "context": output(await buildCoachContext({ request: args.slice(1).join(" "), store, maxRecords: Number(value("--limit") ?? 10) })); return;
    case "read": output(await store.getDocument(documentKey(args[1]))); return;
    case "query": output(await store.queryCollection(collectionKey(args[1]), { limit: Math.min(Number(value("--limit") ?? 10), 25), hydrateContent: true })); return;
    case "propose": {
      const input = await stdinJson() as { kind: MutationKind; request: ProposedOperation }; const ledger = new ProposalLedger(proposalDir); output(await ledger.propose(input.kind, input.request)); return;
    }
    case "write": {
      const input = await stdinJson() as { kind: MutationKind; request: ProposedOperation }; assertAutoWritable(input.kind); assertSufficientAuthority(input.kind, operationAuthority(input.request)); output(await execute(input.request, store)); return;
    }
    case "approve": {
      const id = args[1]; if (!id) throw new Error("Usage: approve <proposal-id>");
      if (!process.stdin.isTTY) throw new Error("Approval requires an interactive trusted terminal; it cannot be supplied as an argument or piped input");
      const ledger = new ProposalLedger(proposalDir); const proposal = await ledger.load(id);
      const answer = prompt(`Type APPROVE ${proposal.id} to execute ${proposal.authority} mutation:`);
      if (answer !== `APPROVE ${proposal.id}`) throw new Error("Approval cancelled");
      const result = await execute(proposal.request, store); await ledger.discard(id); output({ executed: true, proposalId: id, result }); return;
    }
    default: throw new Error("Usage: LifeosCoach.ts <context|read|query|write|propose|approve|storage status>");
  }
}

if (import.meta.main) { await mkdir(proposalDir, { recursive: true, mode: 0o700 }); await runCoachCli(); }
