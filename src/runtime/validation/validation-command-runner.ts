import type { SandboxCommandWorkspaceTrust } from '../../sandbox/sandbox-command-policy.js'
import type { SandboxAuthorizationContext } from '../../sandbox/sandbox-policy-model.js'
import {
  DockerSandboxRunner,
  parseWorkspaceCommand,
  type SandboxRunner,
} from '../sandbox/sandbox-runner.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import {
  evaluateValidationCommandGate,
  type ValidationCommandGateResult,
  type ValidationCommandRequest,
} from './validation-command-gate.js'

export type ValidationCommandExecutionOutcome = 'BLOCKED' | 'DRY_RUN' | 'EXECUTED'

export interface ValidationCommandExecutionResult {
  readonly outcome: ValidationCommandExecutionOutcome
  readonly gateResult: ValidationCommandGateResult
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly error: string | null
}

export async function executeValidationCommand(
  request: ValidationCommandRequest,
  cwd: string,
  policy: RuntimePolicySnapshot,
  approval: RuntimeApproval | undefined,
  sandboxRunner?: SandboxRunner,
  authorization?: SandboxAuthorizationContext,
  workspaceTrust: SandboxCommandWorkspaceTrust = 'trusted-local',
): Promise<ValidationCommandExecutionResult> {
  const gateResult = evaluateValidationCommandGate(request, policy, approval)

  if (gateResult.decision === 'BLOCKED') {
    return {
      outcome: 'BLOCKED',
      gateResult,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
    }
  }

  if (gateResult.dryRun) {
    return {
      outcome: 'DRY_RUN',
      gateResult,
      exitCode: null,
      stdout: '',
      stderr: '',
      error: null,
    }
  }

  let parsedCommand
  try {
    parsedCommand = parseWorkspaceCommand(gateResult.command)
  } catch (error) {
    return {
      outcome: 'BLOCKED',
      gateResult: {
        ...gateResult,
        decision: 'BLOCKED',
        blockReasons: [
          ...gateResult.blockReasons,
          error instanceof Error ? error.message : String(error),
        ],
      },
      exitCode: null,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const runner = sandboxRunner ?? new DockerSandboxRunner({ authorization, workspaceTrust })
  const result = await runner.runCommand({
    ...parsedCommand,
    workspaceRoot: cwd,
    workspaceTrust,
    ...(authorization === undefined ? {} : { authorization }),
  })

  if (result.outcome === 'BLOCKED') {
    return {
      outcome: 'BLOCKED',
      gateResult,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.reason,
    }
  }

  return {
    outcome: 'EXECUTED',
    gateResult,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    error: null,
  }
}

export function renderValidationCommandExecutionResult(
  result: ValidationCommandExecutionResult,
): string {
  const sections: string[] = [
    'SymbolWright validation command execution',
    '',
    `Outcome: ${result.outcome}`,
    `Command: ${result.gateResult.command}`,
    `Reason: ${result.gateResult.reason}`,
    `Exit code: ${result.exitCode === null ? 'not run' : String(result.exitCode)}`,
  ]

  if (result.gateResult.blockReasons.length > 0) {
    sections.push('', 'Block reasons:')
    sections.push(...result.gateResult.blockReasons.map((reason) => `- ${reason}`))
  }
  if (result.outcome === 'DRY_RUN') {
    sections.push('', 'Dry-run only. No command has been executed.')
  }
  if (result.outcome === 'EXECUTED') {
    sections.push('', 'Approved validation command executed through the sandbox broker.')
  }
  if (result.stdout.length > 0) sections.push('', 'stdout:', result.stdout)
  if (result.stderr.length > 0) sections.push('', 'stderr:', result.stderr)
  if (result.error !== null) sections.push('', `Error: ${result.error}`)
  return sections.join('\n')
}
