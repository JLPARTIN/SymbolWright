import {
  resolveEffectiveSandboxCommandPolicy,
  type EffectiveSandboxCommandPolicy,
  type SandboxCommandPolicyRequest,
} from './sandbox-command-policy.js'
import { evaluateSandboxPolicy } from './sandbox-policy.js'
import {
  SandboxPolicyCatalog,
  resolveEffectiveSandboxPolicy,
  type EffectiveSandboxPolicy,
  type SandboxAuthorizationContext,
  type SandboxPolicyResolution,
} from './sandbox-policy-model.js'
import type { SandboxExecutionRequest, SandboxRunnerDefinition } from './sandbox-types.js'

export interface SandboxBrokerDecision {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly reason: string
  readonly policy?: EffectiveSandboxPolicy
  readonly effectiveRunner?: SandboxRunnerDefinition
}

export interface SandboxCommandBrokerDecision {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly reason: string
  readonly policy?: EffectiveSandboxCommandPolicy
}

export interface SandboxExecutionBrokerOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly catalog?: SandboxPolicyCatalog
  readonly now?: () => Date
}

/**
 * The sole policy-authority entry point for sandbox execution. Structured code requests and
 * compatibility command requests both resolve immutable policy here before an executor sees them.
 * Executors never re-interpret caller JSON, grant fields, deployment posture, or workspace trust.
 */
export class SandboxExecutionBroker {
  private readonly env: NodeJS.ProcessEnv
  private readonly catalog: SandboxPolicyCatalog
  private readonly now: () => Date

  public constructor(options: SandboxExecutionBrokerOptions = {}) {
    this.env = options.env ?? process.env
    this.catalog = options.catalog ?? new SandboxPolicyCatalog()
    this.now = options.now ?? (() => new Date())
  }

  public authorize(
    request: SandboxExecutionRequest,
    runner: SandboxRunnerDefinition | undefined,
    authorization: SandboxAuthorizationContext,
  ): SandboxBrokerDecision {
    const resolution = resolveEffectiveSandboxPolicy({
      request,
      ...(runner === undefined ? {} : { runner }),
      authorization,
      catalog: this.catalog,
      env: this.env,
      now: this.now,
    })
    if (!resolution.allowed || resolution.policy === undefined || runner === undefined) {
      return fromResolution(resolution)
    }

    const effectiveRunner: SandboxRunnerDefinition = {
      ...runner,
      limits: resolution.policy.limits,
      // Offline execution is the only executable profile today. Dependency acquisition and egress
      // are separate future broker paths and never turn into direct runner networking here.
      networkPolicy: 'disabled',
      capabilities: { ...runner.capabilities, network: false },
    }
    const runnerDecision = evaluateSandboxPolicy(request, effectiveRunner, {
      mode: authorization.runtimeMode,
      env: this.env,
    })
    if (!runnerDecision.allowed) {
      return {
        allowed: false,
        reasonCode: 'SANDBOX_RUNNER_POLICY_BLOCKED',
        reason: runnerDecision.reason,
        policy: resolution.policy,
        effectiveRunner,
      }
    }

    return {
      allowed: true,
      reasonCode: resolution.reasonCode,
      reason: resolution.reason,
      policy: resolution.policy,
      effectiveRunner,
    }
  }

  public authorizeCommand(
    request: SandboxCommandPolicyRequest,
    authorization: SandboxAuthorizationContext,
  ): SandboxCommandBrokerDecision {
    return resolveEffectiveSandboxCommandPolicy({
      request,
      authorization,
      env: this.env,
      now: this.now,
    })
  }
}

function fromResolution(resolution: SandboxPolicyResolution): SandboxBrokerDecision {
  return {
    allowed: false,
    reasonCode: resolution.reasonCode,
    reason: resolution.reason,
    ...(resolution.policy === undefined ? {} : { policy: resolution.policy }),
  }
}
