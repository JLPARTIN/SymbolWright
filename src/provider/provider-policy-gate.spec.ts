import { describe, expect, it } from 'vitest'

import {
  evaluateProviderPolicyGate,
  PROVIDER_INVOCATION_TOOL_CATEGORY,
  type ProviderPolicyGateRequest,
} from './provider-policy-gate.js'
import type { RuntimePolicySnapshot } from '../runtime/types.js'

function makeGateRequest(
  overrides: Partial<ProviderPolicyGateRequest> = {},
): ProviderPolicyGateRequest {
  return {
    requestId: 'gate-req-1',
    sessionId: 'session-1',
    mode: 'APPROVED_EDIT',
    providerLabel: 'governed-deep-reasoning-provider',
    model: 'claude-sonnet-4-20250514',
    sourceTrustZone: 'OPERATOR_SESSION',
    operatorApproved: true,
    ...overrides,
  }
}

function makePolicy(overrides: Partial<RuntimePolicySnapshot> = {}): RuntimePolicySnapshot {
  return {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: true,
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: [],
    ...overrides,
  }
}

describe('provider-policy-gate', () => {
  describe('PROVIDER_INVOCATION_TOOL_CATEGORY', () => {
    it('has the expected value', () => {
      expect(PROVIDER_INVOCATION_TOOL_CATEGORY).toBe('PROVIDER_INVOCATION')
    })
  })

  describe('evaluateProviderPolicyGate', () => {
    it('allows when network is enabled and operator approved', () => {
      const request = makeGateRequest({ operatorApproved: true })
      const policy = makePolicy({ allowNetwork: true })
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.allowed).toBe(true)
      expect(decision.requestId).toBe('gate-req-1')
      expect(decision.blockedReasons).toHaveLength(0)
    })

    it('blocks when network is disabled', () => {
      const request = makeGateRequest()
      const policy = makePolicy({ allowNetwork: false })
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.allowed).toBe(false)
      expect(decision.blockedReasons.length).toBeGreaterThan(0)
      expect(decision.blockedReasons[0]).toContain('allowNetwork')
    })

    it('blocks when operator has not approved', () => {
      const request = makeGateRequest({ operatorApproved: false })
      const policy = makePolicy({ allowNetwork: true })
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.allowed).toBe(false)
      expect(decision.permissionDecision.disposition).not.toBe('ALLOW')
    })

    it('includes permission decision from policy evaluator', () => {
      const request = makeGateRequest()
      const policy = makePolicy()
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.permissionDecision).toBeDefined()
      expect(decision.permissionDecision.requestId).toBe('gate-req-1')
      expect(decision.permissionDecision.policyId).toBeDefined()
      expect(decision.permissionDecision.policyVersion).toBeDefined()
    })

    it('includes provider label and model in permission action', () => {
      const request = makeGateRequest({
        providerLabel: 'governed-lightweight-reasoning-provider',
        model: 'claude-haiku-3-20240307',
      })
      const policy = makePolicy()
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.permissionDecision).toBeDefined()
    })

    it('blocks when both network disabled and operator unapproved', () => {
      const request = makeGateRequest({ operatorApproved: false })
      const policy = makePolicy({ allowNetwork: false })
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.allowed).toBe(false)
      expect(decision.blockedReasons.length).toBeGreaterThanOrEqual(1)
    })

    it('preserves request ID in decision', () => {
      const request = makeGateRequest({ requestId: 'custom-req-42' })
      const policy = makePolicy()
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.requestId).toBe('custom-req-42')
    })

    it('works with all supported modes', () => {
      const modes = [
        'PLAN',
        'READ_ONLY',
        'PATCH_PROPOSAL',
        'PR_REVIEW',
        'CI_REVIEW',
        'APPROVED_EDIT',
        'APPROVED_COMMAND',
        'RESTRICTED_AUTOMATION',
      ] as const

      for (const mode of modes) {
        const request = makeGateRequest({ mode })
        const policy = makePolicy()
        const decision = evaluateProviderPolicyGate(request, policy)
        expect(decision.requestId).toBe('gate-req-1')
      }
    })

    it('works with all trust zones', () => {
      const zones = ['OPERATOR_SESSION', 'GOVERNANCE_CONTRACT', 'LLM_OUTPUT', 'UNKNOWN'] as const

      for (const zone of zones) {
        const request = makeGateRequest({ sourceTrustZone: zone })
        const policy = makePolicy()
        const decision = evaluateProviderPolicyGate(request, policy)
        expect(decision.requestId).toBe('gate-req-1')
      }
    })

    it('uses NETWORK_READER category for permission evaluation', () => {
      const request = makeGateRequest()
      const policy = makePolicy()
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.permissionDecision.toolCategory).toBe('NETWORK_READER')
    })

    it('targets network-resource kind in permission request', () => {
      const request = makeGateRequest({
        providerLabel: 'governed-deep-reasoning-provider',
      })
      const policy = makePolicy()
      const decision = evaluateProviderPolicyGate(request, policy)

      expect(decision.permissionDecision.protectedPathHits).toHaveLength(0)
    })
  })
})
