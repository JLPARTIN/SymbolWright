import { spawn } from 'node:child_process'

import type { RuntimeToolDefinition, RuntimeToolContext } from '../types.js'
import { evaluateGitToolRequest, renderGitToolResult, READ_OPERATIONS, type GitToolInput, type GitOperation } from './git-tool.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'

const VALID_OPERATIONS = new Set<string>([
  'status', 'diff', 'log', 'branch', 'show',
  'checkout_new', 'add', 'commit', 'push',
])

function parseGitExecuteInput(input: unknown): GitToolInput {
  if (typeof input !== 'object' || input === null || !('operation' in input)) {
    throw new Error('Missing operation: git requires an operation (status, diff, log, add, commit, push, etc.)')
  }
  const raw = input as Record<string, unknown>
  if (typeof raw['operation'] !== 'string' || !VALID_OPERATIONS.has(raw['operation'])) {
    throw new Error(`Invalid git operation: ${String(raw['operation'])}. Valid: ${[...VALID_OPERATIONS].join(', ')}`)
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

function executeGit(args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    child.on('close', (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode: code,
      })
    })

    child.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
      })
    })
  })
}

export async function executeGitTool(input: unknown, context: RuntimeToolContext): Promise<string> {
  const parsed = parseGitExecuteInput(input)
  const policyResult = evaluateGitToolRequest(parsed, context.policy)

  if (!policyResult.allowed) {
    return renderGitToolResult(policyResult)
  }

  const isReadOp = READ_OPERATIONS.has(parsed.operation)
  if (!isReadOp && !context.policy.allowWrites) {
    return [
      `Git operation: ${parsed.operation}`,
      'Status: BLOCKED',
      'Reason: Write operations require write permission in the current policy.',
      '',
      renderRuntimeBoundary(),
    ].join('\n')
  }

  const args = buildGitArgs(parsed)
  const result = await executeGit(args, context.cwd, 60_000)

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
  description: 'Execute git operations (status, diff, log, add, commit, push, checkout -b). Read ops are always allowed; write ops require write permission.',
  capability: 'APPROVED_COMMAND',
  execute: executeGitTool,
}
