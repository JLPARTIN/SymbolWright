import { runGitCommand } from '../git/git-command-runner.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import {
  evaluateGitToolRequest,
  renderGitToolResult,
  type GitOperation,
  type GitToolInput,
} from './git-tool.js'

const VALID_OPERATIONS = new Set<string>([
  'status',
  'diff',
  'log',
  'branch',
  'show',
  'checkout_new',
  'add',
  'commit',
  'push',
])

function parseGitExecuteInput(input: unknown): GitToolInput {
  if (typeof input !== 'object' || input === null || !('operation' in input)) {
    throw new Error(
      'Missing operation: git requires an operation (status, diff, log, add, commit, push, etc.)',
    )
  }
  const raw = input as Record<string, unknown>
  if (typeof raw['operation'] !== 'string' || !VALID_OPERATIONS.has(raw['operation'])) {
    throw new Error(
      `Invalid git operation: ${String(raw['operation'])}. Valid: ${[...VALID_OPERATIONS].join(', ')}`,
    )
  }
  const args = Array.isArray(raw['args'])
    ? (raw['args'] as unknown[]).filter((a): a is string => typeof a === 'string')
    : undefined
  return {
    operation: raw['operation'] as GitOperation,
    ...(args !== undefined && args.length > 0 ? { args } : {}),
    ...(typeof raw['message'] === 'string' ? { message: raw['message'] } : {}),
  }
}

function buildGitArgs(input: GitToolInput): string[] {
  const args: string[] = []

  if (input.operation === 'checkout_new') {
    args.push('checkout', '-b')
  } else {
    args.push(input.operation)
  }

  if (input.operation === 'commit' && input.message !== undefined) {
    args.push('-m', input.message)
  }

  if (input.args !== undefined) {
    args.push(...input.args)
  }

  return args
}

function assertTrustedOperatorGitExecution(context: RuntimeToolContext): void {
  if (
    context.accessControl !== undefined ||
    context.untrustedRepositoryContent === true ||
    (context.sandboxAuthorization !== undefined &&
      context.sandboxAuthorization.callerKind !== 'operator')
  ) {
    throw new Error(
      'authorization_denied[TRUSTED_OPERATOR_GIT_REQUIRED]: the git runtime tool launches a host Git process and is restricted to a trusted local operator checkout. Delegated and untrusted-repository callers must use governed GitHub write tools or isolated repository workflows.',
    )
  }
}

export async function executeGitTool(input: unknown, context: RuntimeToolContext): Promise<string> {
  const parsed = parseGitExecuteInput(input)
  const policyResult = evaluateGitToolRequest(parsed, context.policy)

  if (!policyResult.allowed) {
    return renderGitToolResult(policyResult)
  }

  assertTrustedOperatorGitExecution(context)
  const args = buildGitArgs(parsed)
  const result = await runGitCommand(args, context.cwd, 60_000)

  const lines = [
    `Git operation: ${parsed.operation}`,
    `Command: git ${args.join(' ')}`,
    `Exit code: ${result.exitCode ?? 'unknown'}`,
  ]

  if (result.stdout.length > 0) {
    lines.push('', 'Output:', result.stdout.trimEnd())
  }
  if (result.stderr.length > 0) {
    lines.push('', 'Stderr:', result.stderr.trimEnd())
  }

  lines.push('', renderRuntimeBoundary())
  return lines.join('\n')
}

export const gitExecuteTool: RuntimeToolDefinition = {
  name: 'git',
  description:
    'Execute a narrow Git operation only from a trusted local operator checkout. Delegated and untrusted-repository callers are denied before host process creation.',
  capability: 'APPROVED_COMMAND',
  execute: executeGitTool,
}
