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
  | 'apply_patch'
  | 'validation_command_gate'
  | 'pr_preparation'
  | 'github_write_proposal'
  | 'github_write_gate'
  | 'github_create_pr'
  | 'pr_collaboration'
  | 'zflow_report'
  | 'zflow_report_rollup'
  | 'zflow_report_catalog'
  | 'glob'
  | 'grep'
  | 'bash'
  | 'edit_file'
  | 'git'
  | 'swarm_dispatch'
  | 'run_tests'
  | 'run_typecheck'
  | 'run_lint'

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
  | 'PATCH_APPLICATION'
  | 'VALIDATION_COMMAND'
  | 'PR_PREPARATION'
  | 'GITHUB_WRITE_PROPOSAL'
  | 'GITHUB_WRITE_GATE'
  | 'GITHUB_PR_CREATION'
  | 'GITHUB_PR_COLLABORATION'
  | 'ZFLOW_REPORT'
  | 'ZFLOW_REPORT_CATALOG'

export type RuntimeApprovalScope =
  | 'file:write'
  | 'github:write'
  | 'command:validate'
  | 'apply_edit'
  | 'command_dry_run'

export const ALL_APPROVAL_SCOPES: readonly RuntimeApprovalScope[] = [
  'file:write',
  'github:write',
  'command:validate',
  'apply_edit',
  'command_dry_run',
] as const

export function isValidApprovalScope(scope: string): scope is RuntimeApprovalScope {
  return (ALL_APPROVAL_SCOPES as readonly string[]).includes(scope)
}

export interface RuntimeApproval {
  readonly ticketId: string
  readonly approvedBy: string
  readonly scopes: readonly RuntimeApprovalScope[]
}

export interface RuntimePolicySnapshot {
  readonly mode: CodemindRuntimeMode
  readonly allowNetwork: boolean
  readonly allowShell: boolean
  readonly allowWrites: boolean
  readonly allowGitHubWrites: boolean
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

export const ALL_CODEMIND_TOOL_NAMES = [
  'plan_goal',
  'list_files',
  'read_file',
  'search_files',
  'propose_edit',
  'validation_plan',
  'ci_review',
  'pr_notes',
  'apply_edit_gated',
  'command_dry_run_gated',
  'github_pr_fixture_review',
  'github_ci_fixture_review',
  'live_read_policy_handshake',
  'live_read_client_fixture',
  'github_live_read_pr',
  'github_live_read_ci',
  'ajna_live_read_review',
  'ajna_live_read_merge_readiness',
  'operator_review_packet',
  'write_intent_plan',
  'local_file_write',
  'apply_patch',
  'validation_command_gate',
  'pr_preparation',
  'github_write_proposal',
  'github_write_gate',
  'github_create_pr',
  'pr_collaboration',
  'zflow_report',
  'zflow_report_rollup',
  'zflow_report_catalog',
  'glob',
  'grep',
  'bash',
  'edit_file',
  'git',
  'swarm_dispatch',
  'run_tests',
  'run_typecheck',
  'run_lint',
] as const satisfies readonly CodemindToolName[]

type _AssertAllToolNames = CodemindToolName extends (typeof ALL_CODEMIND_TOOL_NAMES)[number] ? true : never
const _allToolNamesCheck: _AssertAllToolNames = true
void _allToolNamesCheck
