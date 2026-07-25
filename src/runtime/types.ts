import type { RuntimeLiveReadClient } from './live-read/runtime-live-read-client.js'
import type { GitHubPrCreationClient } from './github-write/github-pr-creation.js'
import type { GitHubWriteExecutorClient } from './github-write/github-write-executor.js'
import type { PrCollaborationClient } from './github-write/pr-collaboration.js'
import type { AgentMemoryTools } from '../memory/agent-tools.js'
import type { EmbeddingProvider } from '../memory/embedding-provider.js'
import type { WorkspaceManager } from '../workspace/workspace-manager.js'
import type { SandboxFileWriter, SandboxRunner } from './sandbox/sandbox-runner.js'
import type { SandboxService } from '../sandbox/sandbox-service.js'
import type { SandboxExecutionRequest, SandboxExecutionResult } from '../sandbox/sandbox-types.js'

/** Supported execution modes from plan-only to approved execution. */
export type SymbolWrightRuntimeMode =
  | 'PLAN_ONLY'
  | 'READ_ONLY'
  | 'PROPOSAL_ONLY'
  | 'APPROVED_EXECUTION'

/** Union of all registered tool names in the runtime. */
export type SymbolWrightToolName =
  | 'plan_goal'
  | 'list_files'
  | 'read_file'
  | 'search_files'
  | 'propose_edit'
  | 'validation_plan'
  | 'ci_review'
  | 'pr_notes'
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
  | 'memory_recall'
  | 'memory_store'
  | 'preflight'
  | 'mcp_call'
  | 'web_fetch'
  | 'web_search'
  | 'subagent_run'
  | 'skill_run'
  | 'sandbox_list_runtimes'
  | 'sandbox_execute'

/** Capability categories that determine tool availability per mode. */
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
  | 'MEMORY_ACCESS'
  | 'PR_PREFLIGHT'
  | 'MCP_TOOL'
  | 'WEB_ACCESS'
  | 'SKILL'

/** Typed scopes for approval tickets — each covers a distinct live write or execution surface. */
export type RuntimeApprovalScope =
  | 'file:write'
  | 'github:write'
  | 'command:validate'
  | 'apply_edit'
  | 'command_dry_run'
  | 'shell:execute'
  | 'git:write'
  | 'web:access'

/** Exhaustive list of all approval scopes for runtime validation. */
export const ALL_APPROVAL_SCOPES: readonly RuntimeApprovalScope[] = [
  'file:write',
  'github:write',
  'command:validate',
  'apply_edit',
  'command_dry_run',
  'shell:execute',
  'git:write',
  'web:access',
] as const

/** Type guard: returns true if scope is a known RuntimeApprovalScope. */
export function isValidApprovalScope(scope: string): scope is RuntimeApprovalScope {
  return (ALL_APPROVAL_SCOPES as readonly string[]).includes(scope)
}

/** An operator-issued approval ticket authorizing gated actions. */
export interface RuntimeApproval {
  readonly ticketId: string
  readonly approvedBy: string
  readonly scopes: readonly RuntimeApprovalScope[]
}

/** Immutable snapshot of the active runtime policy governing tool access. */
export interface RuntimePolicySnapshot {
  readonly mode: SymbolWrightRuntimeMode
  readonly allowNetwork: boolean
  /**
   * Read-only info access — doc/package lookups, web fetch/search, repo context.
   * True in every mode: this is the "protect from obvious abuse only" surface,
   * not a mutation risk, so it isn't gated behind APPROVED_EXECUTION like
   * allowNetwork (which also gates the provider/LLM invocation channel).
   */
  readonly allowReadOnlyNetwork: boolean
  readonly allowShell: boolean
  readonly allowWrites: boolean
  readonly allowGitHubWrites: boolean
  readonly protectedPaths: readonly string[]
  readonly noisyDirs: readonly string[]
}

/** Registry of injected GitHub clients for live operations. */
export interface GitHubClientRegistry {
  readonly liveReadClient?: RuntimeLiveReadClient
  readonly prCreationClient?: GitHubPrCreationClient
  readonly writeExecutorClient?: GitHubWriteExecutorClient
  readonly collaborationClient?: PrCollaborationClient
}

/**
 * Per-request delegated-agent-access enforcement hook. Present only when the caller authenticated
 * with a scoped agent token (see `src/access/`) rather than the legacy operator API key. Callers
 * close over the real `AuthorizationService` and the request's repository/branch/mission context;
 * `requireAuthorized` rejects when the capability is not granted, scope is exceeded, or an
 * operator approval is still pending — see `src/runtime/tools/authorized-tool-execution.ts`.
 */
export interface ToolAccessControl {
  readonly principalId: string
  readonly grantId: string
  readonly sessionId?: string
  readonly requireAuthorized: (capability: string, toolName: string) => Promise<void>
}

/** Context passed to every tool execution — cwd, policy, and optional execution adapters. */
export interface RuntimeToolContext {
  readonly cwd: string
  readonly policy: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
  readonly githubClients?: GitHubClientRegistry
  readonly embeddingProvider?: EmbeddingProvider
  readonly workspace?: WorkspaceManager
  readonly sandboxRunner?: SandboxRunner
  readonly sandboxFileWriter?: SandboxFileWriter
  readonly sandboxService?: SandboxService
  readonly recordSandboxExecution?: (
    request: SandboxExecutionRequest,
    result: SandboxExecutionResult,
  ) => void
  readonly memoryTools?: AgentMemoryTools
  /** Groups checkpoints under `.symbolwright/checkpoints/<sessionId>/`. Auto-generated when absent. */
  readonly sessionId?: string
  /**
   * True when the active mission's repository was acquired from external,
   * untrusted intake (Bundle #8) rather than being the operator's own
   * trusted checkout. When set, `READ`/`SEARCH` tool output is wrapped in
   * an untrusted-content delimiter before it reaches the LLM (see
   * `src/runtime/context/untrusted-content-boundary.ts`).
   */
  readonly untrustedRepositoryContent?: boolean
  readonly accessControl?: ToolAccessControl
}

/** Defines a runtime tool with name, capability, and typed execute function. */
export interface RuntimeToolDefinition<TInput = unknown> {
  readonly name: SymbolWrightToolName
  readonly description: string
  readonly capability: RuntimeToolCapability
  readonly execute: (input: TInput, context: RuntimeToolContext) => Promise<string>
}

/** A single step in a goal plan with optional dependency references. */
export interface GoalPlanStep {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly dependsOn?: readonly string[]
}

/** A structured plan with a goal and ordered steps. */
export interface GoalPlan {
  readonly goal: string
  readonly steps: readonly GoalPlanStep[]
}

/** Result of a runtime loop iteration — completed, blocked, or iteration limit reached. */
export interface RuntimeLoopResult {
  readonly status: 'completed' | 'blocked' | 'iteration_limit'
  readonly finalMessage: string
  readonly iterations: number
}

/** Compile-time-verified array of every SymbolWrightToolName. */
export const ALL_SYMBOLWRIGHT_TOOL_NAMES = [
  'plan_goal',
  'list_files',
  'read_file',
  'search_files',
  'propose_edit',
  'validation_plan',
  'ci_review',
  'pr_notes',
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
  'memory_recall',
  'memory_store',
  'preflight',
  'mcp_call',
  'web_fetch',
  'web_search',
  'subagent_run',
  'skill_run',
  'sandbox_list_runtimes',
  'sandbox_execute',
] as const satisfies readonly SymbolWrightToolName[]

type _AssertAllToolNames = SymbolWrightToolName extends (typeof ALL_SYMBOLWRIGHT_TOOL_NAMES)[number]
  ? true
  : never
