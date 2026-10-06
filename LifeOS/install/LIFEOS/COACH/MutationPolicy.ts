export type MutationAuthority = "auto_write" | "propose_first" | "explicit_approval";
export type MutationKind =
  | "observation" | "journal" | "completion_evidence" | "measurement" | "current_state"
  | "project_priority" | "goal_status" | "plan" | "habit" | "inferred_blocker" | "timeline"
  | "identity" | "mission" | "belief" | "core_strategy" | "major_goal" | "relationship_interpretation" | "delete";

const AUTO = new Set<MutationKind>(["observation", "journal", "completion_evidence", "measurement", "current_state"]);
const PROPOSE = new Set<MutationKind>(["project_priority", "goal_status", "plan", "habit", "inferred_blocker", "timeline"]);
export function mutationAuthority(kind: MutationKind): MutationAuthority { return AUTO.has(kind) ? "auto_write" : PROPOSE.has(kind) ? "propose_first" : "explicit_approval"; }

/** Only low-authority mutations may bypass the trusted proposal approval channel. */
export function assertAutoWritable(kind: MutationKind): void {
  const authority = mutationAuthority(kind);
  if (authority !== "auto_write") throw new Error(`Mutation ${kind} requires a trusted ${authority === "propose_first" ? "proposal" : "explicit approval"} operation`);
}

const AUTHORITY_RANK: Record<MutationAuthority, number> = { auto_write: 0, propose_first: 1, explicit_approval: 2 };
export function assertSufficientAuthority(kind: MutationKind, required: MutationAuthority): void {
  if (AUTHORITY_RANK[mutationAuthority(kind)] < AUTHORITY_RANK[required]) throw new Error(`Mutation ${kind} cannot authorize a ${required} resource operation`);
}
