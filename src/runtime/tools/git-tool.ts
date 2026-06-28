import type { RuntimePolicySnapshot } from '../types.js'

export type GitOperation =
  | 'status'
  | 'diff'
  | 'log'
  | 'branch'
  | 'show'
  | 'checkout_new'
  | 'add'
  | 'commit'
  | 'push'

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

const BLOCKED_REFS = ['main', 'master', 'production', 'release']

function validatePushArgs(args: readonly string[] | undefined): readonly string[] {
  const reasons: string[] = []

  if (args !== undefined) {
    for (const arg of args) {
      if (arg === '--force' || arg === '-f' || arg === '--force-with-lease') {
        reasons.push('Force push is not allowed.')
      }
    }

    for (const ref of BLOCKED_REFS) {
      if (args.includes(ref)) {
        reasons.push(`Push to protected branch "${ref}" is not allowed.`)
      }
    }
  }

  return reasons
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

  if (input.operation === 'checkout_new' && input.args !== undefined) {
    for (const ref of BLOCKED_REFS) {
      if (input.args.includes(ref)) {
        blockReasons.push(`Cannot checkout protected branch "${ref}".`)
      }
    }
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
