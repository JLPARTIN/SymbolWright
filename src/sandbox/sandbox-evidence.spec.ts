import { describe, expect, it } from 'vitest'

import { SANDBOX_OFFLINE_EXECUTE_CAPABILITY } from '../access/sandbox-capabilities.js'
import { finalizeSandboxExecutionEvidence } from './sandbox-evidence.js'
import { SandboxExecutionBroker } from './sandbox-execution-broker.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxRunnerDefinition,
} from './sandbox-types.js'

const RUNNER: SandboxRunnerDefinition = {
  id: 'container-javascript',
  languageIds: ['javascript'],
  displayName: 'JavaScript container',
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
    network: false,
  },
  limits: DEFAULT_SANDBOX_LIMITS,
  networkPolicy: 'disabled',
  dependencyState: 'ready',
  notes: [],
}

function baseResult(stdout = '', stderr = ''): SandboxExecutionResult {
  return {
    executionId: 'sandbox-1',
    languageId: 'javascript',
    runnerId: RUNNER.id,
    trustClass: RUNNER.trustClass,
    backend: RUNNER.backend,
    status: 'passed',
    startedAt: '2026-07-28T00:00:00.000Z',
    completedAt: '2026-07-28T00:00:01.000Z',
    durationMs: 1_000,
    exitCode: 0,
    stdout,
    stderr,
    outputTruncated: false,
    diagnostics: [],
    artifacts: [],
    evidence: {
      verificationLevel: 'EXECUTED',
      inputHash: 'pre-finalization',
      policyDecision: 'allowed',
    },
    cleanup: { attempted: true, succeeded: true },
  }
}

const AUTHORIZATION: SandboxAuthorizationContext = {
  deploymentMode: 'hosted',
  callerKind: 'delegated-grant',
  runtimeMode: 'APPROVED_EXECUTION',
  approvedCapabilityIds: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
  repositoryId: 'JLPARTIN/SymbolWright',
  workspaceId: 'workspace-secret',
  missionId: 'mission-secret',
  grantId: 'grant-secret',
  grantVersion: 2,
  principalId: 'principal-secret',
  approval: {
    id: 'approval-secret',
    capabilityId: SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
    grantVersion: 2,
    policyVersions: {},
  },
}

describe('sandbox evidence finalization', () => {
  it('hashes caller inputs and records immutable policy evidence without raw authority IDs', () => {
    const request: SandboxExecutionRequest = {
      languageId: 'javascript',
      mode: 'run',
      source: 'api_key=source-super-secret',
      files: [{ path: 'src/index.js', content: 'token=file-super-secret' }],
      repository: {
        rootPath: '/host/private/repository',
        selectedPaths: ['src/index.js'],
      },
      stdin: 'password=stdin-super-secret',
      args: ['--token=argument-super-secret'],
      limits: { timeoutMs: 1_000 },
      missionId: 'mission-secret',
      requestedRunnerId: RUNNER.id,
    }
    const decision = new SandboxExecutionBroker().authorize(request, RUNNER, AUTHORIZATION)
    expect(decision.allowed).toBe(true)

    const finalized = finalizeSandboxExecutionEvidence({
      request,
      result: baseResult('authorization=output-super-secret', 'Bearer abcdefghijklmnopqrstuvwxyz'),
      decision,
      authorization: AUTHORIZATION,
    })

    expect(finalized.evidence.schemaVersion).toBe(1)
    expect(finalized.evidence.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(finalized.evidence.outputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(finalized.evidence.outputExcerpt).toContain('[REDACTED]')
    expect(finalized.evidence.authorization).toMatchObject({
      deploymentMode: 'hosted',
      callerKind: 'delegated-grant',
      capabilityId: SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
    })
    expect(finalized.evidence.authorization?.grantIdHash).toMatch(/^[a-f0-9]{64}$/)
    expect(finalized.evidence.authorization?.principalIdHash).toMatch(/^[a-f0-9]{64}$/)
    expect(finalized.evidence.authorization?.approvalIdHash).toMatch(/^[a-f0-9]{64}$/)
    expect(finalized.evidence.policy).toMatchObject({
      id: 'sandbox-offline-default',
      version: 1,
      intent: 'offline-execution',
      networkMode: 'disabled',
      dependencyMode: 'disabled',
    })
    const sourceVersionIds = Object.keys(finalized.evidence.policy?.sourceVersions ?? {})
    expect(sourceVersionIds).toContainEqual(expect.stringMatching(/^grant:[a-f0-9]{64}$/))
    expect(sourceVersionIds).toContainEqual(expect.stringMatching(/^mission:[a-f0-9]{64}$/))

    const persistedEvidence = JSON.stringify(finalized.evidence)
    for (const raw of [
      'source-super-secret',
      'file-super-secret',
      'stdin-super-secret',
      'argument-super-secret',
      '/host/private/repository',
      'mission-secret',
      'grant-secret',
      'principal-secret',
      'approval-secret',
      'output-super-secret',
      'abcdefghijklmnopqrstuvwxyz',
    ]) {
      expect(persistedEvidence).not.toContain(raw)
    }
  })

  it('finalizes a minimal blocked result without optional hashes or policy metadata', () => {
    const request: SandboxExecutionRequest = {
      languageId: 'javascript',
      mode: 'run',
      source: 'console.log(1)',
    }
    const finalized = finalizeSandboxExecutionEvidence({
      request,
      result: baseResult(),
      decision: {
        allowed: false,
        reasonCode: 'SANDBOX_CAPABILITY_NOT_APPROVED',
        reason: 'blocked',
      },
      authorization: {
        deploymentMode: 'local',
        callerKind: 'operator',
        runtimeMode: 'APPROVED_EXECUTION',
        approvedCapabilityIds: [],
        repositoryId: 'inline-source',
        workspaceId: 'inline-source',
      },
    })
    expect(finalized.evidence.policyDecision).toBe('blocked')
    expect(finalized.evidence.decisionCode).toBe('SANDBOX_CAPABILITY_NOT_APPROVED')
    expect(finalized.evidence.outputHash).toBeUndefined()
    expect(finalized.evidence.outputExcerpt).toBeUndefined()
    expect(finalized.evidence.policy).toBeUndefined()
    expect(finalized.evidence.authorization).toEqual({
      deploymentMode: 'local',
      callerKind: 'operator',
      capabilityId: 'unresolved',
    })
  })
})
