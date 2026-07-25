import type { RuntimeToolDefinition } from '../types.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'
import {
  DockerSandboxRunner,
  parseWorkspaceCommand,
  type SandboxRunner,
  type SandboxRunnerResult,
} from '../sandbox/sandbox-runner.js'

export interface BashToolInput {
  readonly command: string
  readonly timeoutMs?: number
}

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

function renderBlockedCommand(command: string, reason: string): string {
  return [
    'SymbolWright bash',
    '',
    `Command: ${command}`,
    'Status: BLOCKED',
    `Reason: ${reason}`,
    '',
    renderRuntimeBoundary(),
  ].join('\n')
}

function renderSandboxResult(result: SandboxRunnerResult): string {
  const lines = [
    'SymbolWright bash',
    '',
    `Command: ${result.command}`,
    `Runner: ${result.runner}`,
    `Status: ${result.outcome}`,
    `Exit code: ${result.exitCode ?? 'unknown'}`,
  ]

  if (result.reason !== null) {
    lines.push(`Reason: ${result.reason}`)
  }

  if (result.stdout.length > 0) {
    lines.push('', 'stdout:', result.stdout)
  }
  if (result.stderr.length > 0) {
    lines.push('', 'stderr:', result.stderr)
  }

  lines.push('', renderRuntimeBoundary())
  return lines.join('\n')
}

export async function executeBashTool(
  input: BashToolInput,
  cwd: string,
  shellAllowed: boolean,
  sandboxRunner: SandboxRunner = new DockerSandboxRunner(),
): Promise<string> {
  if (!shellAllowed) {
    return renderBlockedCommand(input.command, 'Shell execution is not allowed by current policy.')
  }

  let parsedCommand
  try {
    parsedCommand = parseWorkspaceCommand(input.command)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return renderBlockedCommand(input.command, message)
  }

  const result = await sandboxRunner.runCommand({
    ...parsedCommand,
    workspaceRoot: cwd,
    ...(typeof input.timeoutMs === 'number' ? { timeoutMs: input.timeoutMs } : {}),
  })

  return renderSandboxResult(result)
}

export const bashTool: RuntimeToolDefinition = {
  name: 'bash',
  description: 'Execute a parameterized workspace command inside the zero-trust sandbox runner.',
  capability: 'APPROVED_COMMAND',
  execute: async (input, context) =>
    executeBashTool(
      parseBashInput(input),
      context.cwd,
      context.policy.allowShell,
      context.sandboxRunner,
    ),
}
