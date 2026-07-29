import type { SandboxCommandWorkspaceTrust } from '../../sandbox/sandbox-command-policy.js'
import type { SandboxAuthorizationContext } from '../../sandbox/sandbox-policy-model.js'
import { renderRuntimeBoundary } from '../renderers/runtime-renderers.js'
import {
  DEFAULT_TIMEOUT_MS,
  DockerSandboxRunner,
  parseWorkspaceCommand,
  type SandboxRunner,
  type SandboxRunnerResult,
} from '../sandbox/sandbox-runner.js'
import type { RuntimeToolDefinition } from '../types.js'

export interface BashToolInput {
  readonly command: string
  readonly timeoutMs?: number
}

function normalizeRequestedTimeout(timeoutMs: number | undefined): number | undefined {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined
  return Math.min(Math.floor(timeoutMs), DEFAULT_TIMEOUT_MS)
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

  if (result.reason !== null) lines.push(`Reason: ${result.reason}`)
  if (result.reasonCode !== undefined) lines.push(`Decision: ${result.reasonCode}`)
  if (result.policy !== undefined) lines.push(`Policy fingerprint: ${result.policy.fingerprint}`)
  if (result.stdout.length > 0) lines.push('', 'stdout:', result.stdout)
  if (result.stderr.length > 0) lines.push('', 'stderr:', result.stderr)
  lines.push('', renderRuntimeBoundary())
  return lines.join('\n')
}

export async function executeBashTool(
  input: BashToolInput,
  cwd: string,
  shellAllowed: boolean,
  sandboxRunner?: SandboxRunner,
  authorization?: SandboxAuthorizationContext,
  workspaceTrust: SandboxCommandWorkspaceTrust = 'trusted-local',
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

  const timeoutMs = normalizeRequestedTimeout(input.timeoutMs)
  const runner =
    sandboxRunner ??
    new DockerSandboxRunner({
      workspaceTrust,
      ...(authorization === undefined ? {} : { authorization }),
    })
  const result = await runner.runCommand({
    ...parsedCommand,
    workspaceRoot: cwd,
    workspaceTrust,
    ...(authorization === undefined ? {} : { authorization }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })
  return renderSandboxResult(result)
}

export const bashTool: RuntimeToolDefinition = {
  name: 'bash',
  description:
    'Execute an allowlisted parameterized workspace command through the authoritative sandbox broker. The legacy bind-mounted container is local trusted compatibility, not strong untrusted isolation.',
  capability: 'APPROVED_COMMAND',
  execute: async (input, context) =>
    executeBashTool(
      parseBashInput(input),
      context.cwd,
      context.policy.allowShell,
      context.sandboxRunner,
      context.sandboxAuthorization,
      context.untrustedRepositoryContent ? 'external-untrusted' : 'trusted-local',
    ),
}
