import type { CodemindRuntimeMode } from '../runtime/types.js'
import type { SandboxExecutionRequest, SandboxRunnerDefinition } from './sandbox-types.js'

export interface SandboxPolicyContext {
  readonly mode: CodemindRuntimeMode
  readonly env?: NodeJS.ProcessEnv
}

export interface SandboxPolicyDecision {
  readonly allowed: boolean
  readonly reason: string
}

function guardedHostEnabled(env: NodeJS.ProcessEnv): boolean {
  return env['CODEMIND_ALLOW_GUARDED_HOST_EXECUTION'] === 'true'
}

export function evaluateSandboxPolicy(
  request: SandboxExecutionRequest,
  runner: SandboxRunnerDefinition,
  context: SandboxPolicyContext,
): SandboxPolicyDecision {
  const env = context.env ?? process.env

  if (runner.availability.status !== 'available') {
    return {
      allowed: false,
      reason: runner.availability.reason ?? `Runner ${runner.id} is unavailable.`,
    }
  }

  if (request.mode === 'run' && !runner.capabilities.run) {
    return {
      allowed: false,
      reason: `Runner ${runner.id} does not support run mode.`,
    }
  }
  if (request.mode === 'compile' && !runner.capabilities.compile) {
    return {
      allowed: false,
      reason: `Runner ${runner.id} does not support compile mode.`,
    }
  }
  if (request.mode === 'test' && !runner.capabilities.test) {
    return {
      allowed: false,
      reason: `Runner ${runner.id} does not support test mode.`,
    }
  }
  if (request.repository !== undefined && !runner.capabilities.repository) {
    return {
      allowed: false,
      reason: `Runner ${runner.id} does not support repository execution.`,
    }
  }

  if (context.mode === 'READ_ONLY') {
    return {
      allowed: false,
      reason: 'READ_ONLY may list runtime inventory but cannot execute code.',
    }
  }
  if (context.mode === 'PROPOSAL_ONLY' || context.mode === 'PLAN_ONLY') {
    return {
      allowed: false,
      reason: `${context.mode} may propose an execution plan but cannot run it.`,
    }
  }

  if (runner.trustClass === 'guarded-host') {
    if (!guardedHostEnabled(env)) {
      return {
        allowed: false,
        reason:
          'Guarded-host execution is disabled. Set CODEMIND_ALLOW_GUARDED_HOST_EXECUTION=true to opt in.',
      }
    }
    return {
      allowed: true,
      reason: 'Approved guarded-host execution; not a strong sandbox.',
    }
  }

  if (runner.trustClass === 'unavailable') {
    return { allowed: false, reason: 'The selected runtime is unavailable.' }
  }

  return {
    allowed: true,
    reason: `${runner.trustClass} execution allowed by runtime policy.`,
  }
}
