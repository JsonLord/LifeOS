export type MutationAuthority = "auto_write" | "propose_first" | "explicit_approval";
export type MutationKind =
  | "observation" | "journal" | "completion_evidence" | "measurement" | "current_state"
  | "project_priority" | "goal_status" | "plan" | "habit" | "inferred_blocker" | "timeline"
  | "identity" | "mission" | "belief" | "core_strategy" | "major_goal" | "relationship_interpretation" | "delete";

const AUTO = new Set<MutationKind>(["observation", "journal", "completion_evidence", "measurement", "current_state"]);
const PROPOSE = new Set<MutationKind>(["project_priority", "goal_status", "plan", "habit", "inferred_blocker", "timeline"]);
export function mutationAuthority(kind: MutationKind): MutationAuthority { return AUTO.has(kind) ? "auto_write" : PROPOSE.has(kind) ? "propose_first" : "explicit_approval"; }

export function authorizeMutation(input: { kind: MutationKind; proposed?: boolean; approved?: boolean }): void {
  const authority = mutationAuthority(input.kind);
  if (authority === "propose_first" && !input.proposed && !input.approved) throw new Error(`Mutation ${input.kind} must be proposed first`);
  if (authority === "explicit_approval" && !input.approved) throw new Error(`Mutation ${input.kind} requires explicit approval`);
}
