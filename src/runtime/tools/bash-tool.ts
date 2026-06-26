import { spawn } from 'node:child_process'

import type { RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'
import { redactValidationOutput } from '../validation/validation-output-redactor.js'

export interface BashToolInput {
  readonly command: string
  readonly timeoutMs?: number
}

const COMMAND_ALLOWLIST = [
  /^npm run (test|typecheck|build|lint)/,
  /^npx vitest/,
  /^npx tsc/,
  /^git (status|diff|log|branch|show|add|commit|push|checkout|stash|merge|rebase|fetch|pull|tag|remote|rev-parse)/,
  /^ls\b/,
  /^find\b/,
  /^grep\b/,
  /^cat\b/,
  /^head\b/,
  /^tail\b/,
  /^wc\b/,
  /^mkdir\b/,
  /^pwd$/,
]

const COMMAND_BLOCKLIST = [
  /rm\s+-rf/,
  /sudo\b/,
  /curl.*\|\s*(ba)?sh/,
  /wget.*\|\s*(ba)?sh/,
  /\|\s*(ba)?sh$/,
  />\s*\/dev\/sd/,
  /mkfs/,
  /dd\s+if=/,
]

const DEFAULT_TIMEOUT_MS = 120000

function parseBashInput(input: unknown): BashToolInput {
  if (typeof input !== 'object' || input === null || !('command' in input)) {
    throw new Error('Missing command: bash requires a command string')
  }
  const raw = input as Record<string, unknown>
  if (typeof raw['command'] !== 'string' || raw['command'].trim().length === 0) {
    throw new Error('command must be a non-empty string')
  }
  return {
    command: raw['command'].trim(),
    ...(typeof raw['timeoutMs'] === 'number' ? { timeoutMs: raw['timeoutMs'] } : {}),
  }
}

function isCommandAllowed(command: string): boolean {
  for (const pattern of COMMAND_BLOCKLIST) {
    if (pattern.test(command)) {
      return false
    }
  }
  for (const pattern of COMMAND_ALLOWLIST) {
    if (pattern.test(command)) {
      return true
    }
  }
  return false
}

export async function executeBashTool(
  input: BashToolInput,
  cwd: string,
  shellAllowed: boolean,
): Promise<string> {
  if (!shellAllowed) {
    return [
      'CodeMind bash',
      '',
      `Command: ${input.command}`,
      'Status: BLOCKED',
      'Reason: Shell execution is not allowed by current policy.',
      '',
      renderRuntimeBoundary(),
    ].join('\n')
  }

  if (!isCommandAllowed(input.command)) {
    return [
      'CodeMind bash',
      '',
      `Command: ${input.command}`,
      'Status: BLOCKED',
      'Reason: Command is not in the allowlist or matches a blocked pattern.',
      '',
      renderRuntimeBoundary(),
    ].join('\n')
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return new Promise<string>((resolve) => {
    const child = spawn('bash', ['-c', input.command], {
      cwd,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    child.on('close', (code) => {
      const stdout = redactValidationOutput(Buffer.concat(stdoutChunks).toString('utf-8'))
      const stderr = redactValidationOutput(Buffer.concat(stderrChunks).toString('utf-8'))

      const lines = [
        'CodeMind bash',
        '',
        `Command: ${input.command}`,
        `Exit code: ${code ?? 'unknown'}`,
      ]

      if (stdout.length > 0) {
        lines.push('', 'stdout:', stdout)
      }
      if (stderr.length > 0) {
        lines.push('', 'stderr:', stderr)
      }

      lines.push('', renderRuntimeBoundary())
      resolve(lines.join('\n'))
    })

    child.on('error', (err) => {
      resolve([
        'CodeMind bash',
        '',
        `Command: ${input.command}`,
        `Error: ${err.message}`,
        '',
        renderRuntimeBoundary(),
      ].join('\n'))
    })
  })
}

export const bashTool: RuntimeToolDefinition = {
  name: 'bash',
  description: 'Execute an allowed shell command with output redaction.',
  capability: 'APPROVED_COMMAND',
  execute: async (input, context) =>
    executeBashTool(parseBashInput(input), context.cwd, context.policy.allowShell),
}
