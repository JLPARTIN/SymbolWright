/**
 * Policy layer for GitHub operations Bundle #8 introduces. This is the
 * coarse, first-line switch that decides which category of GitHub operation
 * is even in scope for a given intake/mission run — local, workspace-scoped
 * operations (reading metadata, cloning into a controlled workspace,
 * creating a local branch, staging a local commit) are safe by default.
 * Everything that mutates the real remote repository or its issues/PRs is
 * blocked unless the caller explicitly enables it.
 *
 * This does not replace the existing approval-ticket GitHub write gate
 * (`runtime/github-write/github-write-gate.ts`) — a remote write that
 * passes this policy must still pass that gate (and, for the runtime tool
 * surface, an approval ticket) before any GitHub API call is made. This
 * policy exists because that gate has no concept of local-only operations
 * (clone, local branch, local commit) at all, and Bundle #8 needs one.
 */

export const GITHUB_OPERATIONS = [
  'read_repo_metadata',
  'clone_repo',
  'create_branch',
  'commit_changes',
  'push_branch',
  'open_pull_request',
  'comment_on_issue',
  'label_issue',
  'close_issue',
  'rerun_workflow',
  'delete_branch',
] as const

export type GitHubOperation = (typeof GITHUB_OPERATIONS)[number]

/** Local, workspace-scoped operations. Never touch the real remote repository. */
export const DEFAULT_ALLOWED_OPERATIONS: ReadonlySet<GitHubOperation> = new Set([
  'read_repo_metadata',
  'clone_repo',
  'create_branch',
  'commit_changes',
])

/** Every operation not in the default-allowed set is destructive or remote-mutating. */
export const DEFAULT_BLOCKED_OPERATIONS: readonly GitHubOperation[] = GITHUB_OPERATIONS.filter(
  (operation) => !DEFAULT_ALLOWED_OPERATIONS.has(operation),
)

export interface GitHubOperationsPolicyConfig {
  /** Additional operations to allow beyond the safe local-only default set. */
  readonly enabledOperations?: readonly GitHubOperation[]
}

export interface GitHubOperationEvaluation {
  readonly operation: GitHubOperation
  readonly allowed: boolean
  readonly reason: string
  readonly defaultAllowed: boolean
}

export class GitHubOperationBlockedError extends Error {
  public readonly evaluation: GitHubOperationEvaluation

  public constructor(evaluation: GitHubOperationEvaluation) {
    super(evaluation.reason)
    this.evaluation = evaluation
  }
}

/**
 * Evaluates and enforces which GitHub operations are in scope for a given
 * intake/mission run. Immutable once constructed: policy decisions cannot
 * be changed mid-flight by anything other than constructing a new instance
 * with an explicit, caller-supplied `enabledOperations` list.
 */
export class GitHubOperationsPolicy {
  private readonly enabled: ReadonlySet<GitHubOperation>

  public constructor(config: GitHubOperationsPolicyConfig = {}) {
    this.enabled = new Set([...DEFAULT_ALLOWED_OPERATIONS, ...(config.enabledOperations ?? [])])
  }

  public evaluate(operation: GitHubOperation): GitHubOperationEvaluation {
    const defaultAllowed = DEFAULT_ALLOWED_OPERATIONS.has(operation)
    const allowed = this.enabled.has(operation)
    return {
      operation,
      allowed,
      defaultAllowed,
      reason: allowed
        ? defaultAllowed
          ? `"${operation}" is a local, workspace-scoped operation and is allowed by default.`
          : `"${operation}" was explicitly enabled for this policy instance.`
        : `"${operation}" mutates the real remote repository and is blocked by default. Explicitly add it to enabledOperations to allow it.`,
    }
  }

  public assertAllowed(operation: GitHubOperation): void {
    const evaluation = this.evaluate(operation)
    if (!evaluation.allowed) throw new GitHubOperationBlockedError(evaluation)
  }

  public isAllowed(operation: GitHubOperation): boolean {
    return this.enabled.has(operation)
  }

  public evaluateAll(): readonly GitHubOperationEvaluation[] {
    return GITHUB_OPERATIONS.map((operation) => this.evaluate(operation))
  }

  public blockedOperations(): readonly GitHubOperationEvaluation[] {
    return this.evaluateAll().filter((evaluation) => !evaluation.allowed)
  }
}

export function createGitHubOperationsPolicy(
  config: GitHubOperationsPolicyConfig = {},
): GitHubOperationsPolicy {
  return new GitHubOperationsPolicy(config)
}

export function renderGitHubOperationsPolicyReport(policy: GitHubOperationsPolicy): string {
  const lines = ['CodeMind GitHub operations policy', '']
  for (const evaluation of policy.evaluateAll()) {
    lines.push(`- ${evaluation.operation}: ${evaluation.allowed ? 'ALLOWED' : 'BLOCKED'}`)
    lines.push(`    ${evaluation.reason}`)
  }
  return lines.join('\n')
}
