import { describe, expect, it } from 'vitest'

import { ALL_CAPABILITIES, expandNonHighRiskWildcard } from './access-capability-catalog.js'
import type { AgentAccessGrant } from './access-types.js'
import {
  LEGACY_SANDBOX_EXECUTE_CAPABILITY,
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from './sandbox-capabilities.js'
import { grantAllowsOfflineSandbox } from './sandbox-policy-compat.js'

function grant(
  capabilities: readonly string[],
  deniedCapabilities: readonly string[] = [],
): AgentAccessGrant {
  return {
    id: 'grant-1',
    version: 1,
    principalId: 'principal-1',
    principalType: 'coding-agent',
    displayName: 'Sandbox grant',
    issuedBy: 'operator',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    startsAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-29T00:00:00.000Z',
    status: 'active',
    profileId: 'custom',
    repositoryScope: {
      mode: 'single',
      repositories: ['JLPARTIN/SymbolWright'],
      organizations: [],
    },
    branchScope: {
      allowedPatterns: ['feat/**'],
      deniedPatterns: ['main'],
      defaultBranchReadOnly: true,
      defaultBranchMutationAllowed: false,
    },
    symbolWrightCapabilities: capabilities,
    githubCapabilities: [],
    deniedCapabilities,
    approvalPolicy: { rules: [{ match: '*', requirement: 'none' }] },
    executionLimits: {},
    sessionLimits: {},
  }
}

describe('sandbox capability authority', () => {
  it('accepts canonical or legacy offline grants but honors either explicit denial alias', () => {
    expect(grantAllowsOfflineSandbox(grant([SANDBOX_OFFLINE_EXECUTE_CAPABILITY]))).toBe(true)
    expect(grantAllowsOfflineSandbox(grant([LEGACY_SANDBOX_EXECUTE_CAPABILITY]))).toBe(true)
    expect(grantAllowsOfflineSandbox(grant([]))).toBe(false)
    expect(
      grantAllowsOfflineSandbox(
        grant([SANDBOX_OFFLINE_EXECUTE_CAPABILITY], [LEGACY_SANDBOX_EXECUTE_CAPABILITY]),
      ),
    ).toBe(false)
  })

  it('keeps compatibility aliases and high-risk network surfaces out of wildcard grants', () => {
    const expanded = expandNonHighRiskWildcard(ALL_CAPABILITIES.map((capability) => capability.id))
    expect(expanded).toContain(SANDBOX_OFFLINE_EXECUTE_CAPABILITY)
    expect(expanded).not.toContain(LEGACY_SANDBOX_EXECUTE_CAPABILITY)
    expect(expanded).not.toContain(SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY)
    expect(expanded).not.toContain(SANDBOX_EGRESS_CAPABILITY)
  })
})
