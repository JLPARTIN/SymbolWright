import type { RuntimePolicySnapshot } from '../types.js'

export type GitOperation =
  'status' | 'diff' | 'log' | 'branch' | 'show' | 'checkout_new' | 'add' | 'commit' | 'push'

export const READ_OPERATIONS: ReadonlySet<GitOperation> = new Set([
  'status',
  'diff',
  'log',
  'branch',
  'show',
])

export const WRITE_OPERATIONS: ReadonlySet<GitOperation> = new Set([
  'checkout_new',
  'add',
  'commit',
  'push',
])

export interface GitToolInput {
  readonly operation: GitOperation
  readonly args?: readonly string[]
  readonly message?: string
}

export interface GitToolResult {
  readonly operation: GitOperation
  readonly allowed: boolean
  readonly command: string
  readonly blockReasons: readonly string[]
}

/** Exported so callers outside this module can apply the same protected-ref check. */
export const BLOCKED_REFS = ['main', 'master', 'production', 'release'] as const

const ALLOWED_PUSH_OPTIONS = new Set(['-u', '--set-upstream'])
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

function normalizedBranch(value: string): string {
  return value.replace(/^refs\/heads\//, '').replace(/^\+/, '')
}

function isProtectedBranch(value: string): boolean {
  return BLOCKED_REFS.includes(normalizedBranch(value) as (typeof BLOCKED_REFS)[number])
}

function validatePushArgs(args: readonly string[] | undefined): readonly string[] {
  const reasons: string[] = []
  const positionals: string[] = []

  for (const arg of args ?? []) {
    if (ALLOWED_PUSH_OPTIONS.has(arg)) continue
    if (
      arg === '--force' ||
      arg === '-f' ||
      arg.startsWith('--force=') ||
      arg.startsWith('--force-with-lease') ||
      arg === '--force-if-includes' ||
      arg.startsWith('+')
    ) {
      reasons.push('Force push is not allowed.')
      continue
    }
    if (
      arg === '--all' ||
      arg === '--mirror' ||
      arg === '--delete' ||
      arg === '-d' ||
      arg === '--tags' ||
      arg.startsWith('--repo=')
    ) {
      reasons.push(
        `Aggregate, delete, tag-wide, and repository-override push option "${arg}" is not allowed.`,
      )
      continue
    }
    if (arg.startsWith('-')) {
      reasons.push(`Unsupported git push option "${arg}".`)
      continue
    }
    positionals.push(arg)
  }

  if (positionals[0] !== 'origin') {
    reasons.push('Git push must explicitly target the configured "origin" remote.')
  }
  if (positionals.length > 2) {
    reasons.push('Git push accepts only the origin remote and one optional current-branch target.')
  }

  const target = positionals[1]
  if (target !== undefined) {
    if (target.includes(':')) {
      reasons.push('Explicit source-to-destination refspecs are not allowed.')
    }
    if (target.includes('://') || /^[^/\s@]+@[^/\s:]+:/.test(target)) {
      reasons.push('Direct URL or scp-style push destinations are not allowed.')
    }
    if (isProtectedBranch(target)) {
      reasons.push(`Push to protected branch "${normalizedBranch(target)}" is not allowed.`)
    }
    if (target !== 'HEAD' && !SAFE_BRANCH.test(target)) {
      reasons.push(`Git push target "${target}" is not a safe branch name.`)
    }
  }

  return [...new Set(reasons)]
}

function validateCheckoutArgs(args: readonly string[] | undefined): readonly string[] {
  if (args === undefined || args.length !== 1) {
    return ['checkout_new requires exactly one new branch name.']
  }
  const branch = args[0] ?? ''
  if (!SAFE_BRANCH.test(branch) || branch.startsWith('-') || branch.includes('..')) {
    return ['checkout_new requires a safe branch name without options or revision syntax.']
  }
  return isProtectedBranch(branch)
    ? [`Cannot checkout protected branch "${normalizedBranch(branch)}".`]
    : []
}

function buildCommand(input: GitToolInput): string {
  const parts = ['git', input.operation.replace('_', ' ')]

  if (input.operation === 'commit' && input.message !== undefined) {
    parts.push('-m', JSON.stringify(input.message))
  }

  if (input.args !== undefined) {
    parts.push(...input.args)
  }

  return parts.join(' ')
}

export function evaluateGitToolRequest(
  input: GitToolInput,
  policy: RuntimePolicySnapshot,
): GitToolResult {
  const blockReasons: string[] = []

  if (WRITE_OPERATIONS.has(input.operation) && !policy.allowWrites) {
    blockReasons.push(`Write operation "${input.operation}" requires write permission.`)
  }

  if (input.operation === 'push') {
    blockReasons.push(...validatePushArgs(input.args))
  }

  if (input.operation === 'checkout_new') {
    blockReasons.push(...validateCheckoutArgs(input.args))
  }

  return {
    operation: input.operation,
    allowed: blockReasons.length === 0,
    command: buildCommand(input),
    blockReasons,
  }
}

export function renderGitToolResult(result: GitToolResult): string {
  const lines = [
    `Git operation: ${result.operation}`,
    `Command: ${result.command}`,
    `Allowed: ${result.allowed ? 'yes' : 'no'}`,
  ]

  if (result.blockReasons.length > 0) {
    lines.push('')
    lines.push('Block reasons:')
    for (const reason of result.blockReasons) {
      lines.push(`  - ${reason}`)
    }
  }

  return lines.join('\n')
}
