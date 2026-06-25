export type CodemindRuntimeMode =
  | 'PLAN_ONLY'
  | 'READ_ONLY'
  | 'PROPOSAL_ONLY'
  | 'APPROVED_EXECUTION'

export type CodemindToolName =
  | 'plan_goal'
  | 'list_files'
  | 'read_file'
  | 'search_files'
  | 'propose_edit'
  | 'validation_plan'
  | 'ci_review'
  | 'pr_notes'
  | 'apply_edit_gated'
  | 'command_dry_run_gated'
  | 'github_pr_fixture_review'
  | 'github_ci_fixture_review'
  | 'live_read_policy_handshake'
  | 'live_read_client_fixture'
  | 'github_live_read_pr'
  | 'github_live_read_ci'
  | 'ajna_live_read_review'
  | 'ajna_live_read_merge_readiness'
  | 'operator_review_packet'
  | 'write_intent_plan'
  | 'local_file_write'
  | 'validation_command_gate'
  | 'pr_preparation'

export type RuntimeToolCapability =
  | 'PLAN'
  | 'READ'
  | 'SEARCH'
  | 'PROPOSE'
  | 'VALIDATE'
  | 'REVIEW'
  | 'DRAFT_NOTES'
  | 'APPROVED_EDIT'
  | 'APPROVED_COMMAND'
  | 'EVIDENCE_READ'
  | 'POLICY_CHECK'
  | 'LIVE_READ_CLIENT'
  | 'OPERATOR_REVIEW'
  | 'WRITE_INTENT'
  | 'LOCAL_FILE_WRITE'
  | 'VALIDATION_COMMAND'
  | 'PR_PREPARATION'

export interface RuntimeApproval {
  readonly ticketId: string
  readonly approvedBy: string
  readonly scopes: readonly string[]
}

export interface RuntimePolicySnapshot {
  readonly mode: CodemindRuntimeMode
  readonly allowNetwork: boolean
  readonly allowShell: boolean
  readonly allowWrites: boolean
  readonly protectedPaths: readonly string[]
  readonly noisyDirs: readonly string[]
}

export interface RuntimeToolContext {
  readonly cwd: string
  readonly policy: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
}

export interface RuntimeToolDefinition<TInput = unknown> {
  readonly name: CodemindToolName
  readonly description: string
  readonly capability: RuntimeToolCapability
  readonly execute: (input: TInput, context: RuntimeToolContext) => Promise<string>
}

export interface GoalPlanStep {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly dependsOn?: readonly string[]
}

export interface GoalPlan {
  readonly goal: string
  readonly steps: readonly GoalPlanStep[]
}

export interface RuntimeLoopResult {
  readonly status: 'completed' | 'blocked' | 'iteration_limit'
  readonly finalMessage: string
  readonly iterations: number
}
