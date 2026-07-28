import { describe, expect, it } from 'vitest'

import { ALL_CAPABILITIES, expandNonHighRiskWildcard } from './access-capability-catalog.js'
import type { AgentAccessGrant } from './access-types.js'
import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from './sandbox-capabilities.js'
import { resolveGrantSandboxPolicyReferences } from './sandbox-policy-compat.js'

function grant(overrides: Partial<AgentAccessGrant> = {}): AgentAccessGrant {
  return {
    id: 'grant-1',
    version: 1,
    principalId: 'principal-1',
    principalType: 'coding-agent',
    displayName: 'Sandbox test grant',
    issuedBy: 'operator',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    startsAt: '2026-07-28T00:00:00.000Z',
    expiresAt: '2026-07-29T00:00:00.000Z',
    status: 'active',
    profileId: 'coding-agent',
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
    symbolWrightCapabilities: [SANDBOX_OFFLINE_EXECUTE_CAPABILITY],
    githubCapabilities: [],
    deniedCapabilities: [],
    approvalPolicy: { rules: [{ match: '*', requirement: 'none' }] },
    executionLimits: {},
    sessionLimits: {},
    ...overrides,
  }
}

describe('sandbox grant policy compatibility', () => {
  it('maps legacy false or absent network fields to offline policy only', () => {
    const absent = resolveGrantSandboxPolicyReferences(grant())
    expect(absent.compatibilityMode).toBe('legacy-offline-only')
    expect(absent.references.offline).toEqual({
      id: 'sandbox-offline-default',
      version: 1,
    })
    expect(absent.references.dependency).toBeUndefined()
    expect(absent.references.egress).toBeUndefined()

    const explicitFalse = resolveGrantSandboxPolicyReferences(
      grant({ executionLimits: { sandboxNetworkAccess: false } }),
    )
    expect(explicitFalse.references.offline?.id).toBe('sandbox-offline-default')
  })

  it('fails closed for a persisted legacy true value', () => {
    const resolved = resolveGrantSandboxPolicyReferences(
      grant({ executionLimits: { sandboxNetworkAccess: true } }),
    )
    expect(resolved.unsupportedReason).toContain('unsupported')
    expect(resolved.references).toEqual({})
  })

  it('preserves explicit server-owned references without synthesizing broader authority', () => {
    const resolved = resolveGrantSandboxPolicyReferences(
      grant({
        sandboxPolicyReferences: {
          offline: { id: 'offline-hardened', version: 3 },
          dependency: { id: 'npm-acquisition', version: 2 },
        },
      }),
    )
    expect(resolved.compatibilityMode).toBe('explicit-policy-references')
    expect(resolved.references).toEqual({
      offline: { id: 'offline-hardened', version: 3 },
      dependency: { id: 'npm-acquisition', version: 2 },
    })
    expect(resolved.references.egress).toBeUndefined()
  })

  it('keeps dependency acquisition and egress out of broad wildcard expansion', () => {
    const expanded = expandNonHighRiskWildcard(ALL_CAPABILITIES.map((entry) => entry.id))
    expect(expanded).toContain(SANDBOX_OFFLINE_EXECUTE_CAPABILITY)
    expect(expanded).not.toContain(SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY)
    expect(expanded).not.toContain(SANDBOX_EGRESS_CAPABILITY)
  })
})
