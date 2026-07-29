import { describe, expect, it } from 'vitest'

import {
  SANDBOX_EGRESS_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from '../access/sandbox-capabilities.js'
import {
  DEFAULT_EGRESS_POLICY_LIMITS,
  EGRESS_GLOBAL_POLICY_ID,
  EgressPolicyCatalog,
  type EgressPolicyProfile,
} from './egress-policy.js'
import { SandboxExecutionBroker } from './sandbox-execution-broker.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
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

const egressProfile: EgressPolicyProfile = {
  id: 'runtime-api',
  version: 1,
  enabled: true,
  deploymentModes: ['local'],
  callerKinds: ['operator'],
  allowedHosts: ['api.example.com'],
  allowedMethods: ['GET'],
  allowedRequestHeaders: ['accept'],
  allowedPorts: [443],
  redirectPolicy: 'denied',
  credentialPolicy: 'none',
  requireTls: true,
  auditRetentionDays: 30,
  limits: DEFAULT_EGRESS_POLICY_LIMITS,
}

const egressAuthorization: SandboxAuthorizationContext = {
  deploymentMode: 'local',
  callerKind: 'operator',
  runtimeMode: 'APPROVED_EXECUTION',
  approvedCapabilityIds: [SANDBOX_EGRESS_CAPABILITY],
  repositoryId: 'JLPARTIN/SymbolWright',
  workspaceId: 'workspace-1',
  policyReference: { id: egressProfile.id, version: egressProfile.version },
  approval: {
    id: 'approval-egress-1',
    capabilityId: SANDBOX_EGRESS_CAPABILITY,
    policyVersions: {
      [EGRESS_GLOBAL_POLICY_ID]: 1,
      [egressProfile.id]: egressProfile.version,
      'egress-request-tightening': 1,
    },
  },
}

describe('SandboxExecutionBroker', () => {
  it('forces the effective runner offline even when inventory advertises networking', () => {
    const decision = new SandboxExecutionBroker().authorize(request, runner, authorization)
    expect(decision.allowed).toBe(true)
    expect(decision.effectiveRunner?.networkPolicy).toBe('disabled')
    expect(decision.effectiveRunner?.capabilities.network).toBe(false)
    expect(decision.policy?.network.mode).toBe('disabled')
  })

  it('keeps brokered egress authority separate from direct runner networking', () => {
    const broker = new SandboxExecutionBroker({
      egressCatalog: new EgressPolicyCatalog([egressProfile]),
      env: {},
      now: () => new Date('2026-07-29T00:00:00.000Z'),
    })

    expect(broker.authorizeEgress({}, egressAuthorization)).toMatchObject({
      allowed: true,
      state: 'allowlisted',
      reasonCode: 'EGRESS_POLICY_ALLOWED',
    })

    const execution = broker.authorize(request, runner, authorization)
    expect(execution.allowed).toBe(true)
    expect(execution.effectiveRunner).toMatchObject({
      networkPolicy: 'disabled',
      capabilities: { network: false },
    })
    expect(execution.policy?.network.mode).toBe('disabled')
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
