import { describe, expect, it } from 'vitest'

import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../access/sandbox-capabilities.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
import { SandboxExecutionBroker } from './sandbox-execution-broker.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
import type { SandboxExecutionRequest, SandboxRunnerDefinition } from './sandbox-types.js'

const request: SandboxExecutionRequest = {
  languageId: 'javascript',
  mode: 'run',
  source: 'console.log(1)',
}

const runner: SandboxRunnerDefinition = {
  id: 'container-javascript',
  languageIds: ['javascript'],
  displayName: 'Container JavaScript',
  trustClass: 'container-isolated',
  backend: 'container',
  availability: { status: 'available', checkedAt: '2026-07-28T00:00:00.000Z' },
  capabilities: {
    run: true,
    compile: true,
    test: true,
    stdin: true,
    multiFile: true,
    repository: true,
    network: true,
  },
  limits: DEFAULT_SANDBOX_LIMITS,
  networkPolicy: 'allowlisted',
  dependencyState: 'ready',
  notes: [],
}

const authorization: SandboxAuthorizationContext = {
  deploymentMode: 'local',
  callerKind: 'operator',
  runtimeMode: 'APPROVED_EXECUTION',
  approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
  repositoryId: 'JLPARTIN/SymbolWright',
  workspaceId: 'workspace-1',
}

describe('SandboxExecutionBroker', () => {
  it('forces the effective runner offline even when inventory advertises networking', () => {
    const decision = new SandboxExecutionBroker().authorize(request, runner, authorization)
    expect(decision.allowed).toBe(true)
    expect(decision.effectiveRunner?.networkPolicy).toBe('disabled')
    expect(decision.effectiveRunner?.capabilities.network).toBe(false)
    expect(decision.policy?.network.mode).toBe('disabled')
  })

  it('denies when the capability was not approved by server authority', () => {
    const decision = new SandboxExecutionBroker().authorize(request, runner, {
      ...authorization,
      approvedCapabilityIds: [],
    })
    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'SANDBOX_CAPABILITY_NOT_APPROVED',
    })
  })

  it('preserves legacy runtime-mode refusal behind the broker', () => {
    const decision = new SandboxExecutionBroker().authorize(request, runner, {
      ...authorization,
      runtimeMode: 'READ_ONLY',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reasonCode).toBe('SANDBOX_RUNTIME_MODE_BLOCKED')
  })
})
