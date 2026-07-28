import { evaluateSandboxPolicy } from './sandbox-policy.js'
import {
  SandboxPolicyCatalog,
  resolveEffectiveSandboxPolicy,
  type EffectiveSandboxPolicy,
  type SandboxAuthorizationContext,
  type SandboxPolicyResolution,
} from './sandbox-policy-model.js'
import type {
  SandboxExecutionRequest,
  SandboxRunnerDefinition,
} from './sandbox-types.js'

export interface SandboxBrokerDecision {
  readonly allowed: boolean
  readonly reasonCode: string
  readonly reason: string
  readonly policy?: EffectiveSandboxPolicy
  readonly effectiveRunner?: SandboxRunnerDefinition
}

export interface SandboxExecutionBrokerOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly catalog?: SandboxPolicyCatalog
  readonly now?: () => Date
}

/**
 * The sole policy-authority entry point for structured sandbox execution. It resolves the immutable
 * effective policy first, then applies runner-specific compatibility checks. Executors receive only
 * the resulting effective runner and policy; they do not re-interpret caller JSON or grant fields.
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
      // PR 2 supports only the offline execution profile. Dependency acquisition and egress are
      // separate future broker paths and never turn into direct runner networking here.
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
}

function fromResolution(resolution: SandboxPolicyResolution): SandboxBrokerDecision {
  return {
    allowed: false,
    reasonCode: resolution.reasonCode,
    reason: resolution.reason,
    ...(resolution.policy === undefined ? {} : { policy: resolution.policy }),
  }
}
