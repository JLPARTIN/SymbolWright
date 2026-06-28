import { spawn } from 'node:child_process'

import type { RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'
import { redactValidationOutput } from '../validation/validation-output-redactor.js'

export interface BashToolInput {
  readonly command: string
  readonly timeoutMs?: number
}

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

function isCommandBlocked(command: string): boolean {
  return COMMAND_BLOCKLIST.some((pattern) => pattern.test(command))
}

export async function executeBashTool(
  input: BashToolInput,
  cwd: string,
  shellAllowed: boolean,
  _approval?: unknown,
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

  if (isCommandBlocked(input.command)) {
    return [
      'CodeMind bash',
      '',
      `Command: ${input.command}`,
      'Status: BLOCKED',
      'Reason: Command matches a blocked destructive pattern.',
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
      resolve(
        [
          'CodeMind bash',
          '',
          `Command: ${input.command}`,
          `Error: ${err.message}`,
          '',
          renderRuntimeBoundary(),
        ].join('\n'),
      )
    })
  })
}

export const bashTool: RuntimeToolDefinition = {
  name: 'bash',
  description: 'Execute a shell command in the active workspace with output redaction.',
  capability: 'APPROVED_COMMAND',
  execute: async (input, context) =>
    executeBashTool(
      parseBashInput(input),
      context.cwd,
      context.policy.allowShell,
      context.approval,
    ),
}
