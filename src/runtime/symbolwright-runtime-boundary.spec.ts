import { describe, expect, it } from 'vitest'

import {
  createReadOnlyRuntimeCapabilityFlags,
  evaluateCodemindRuntimeBoundary,
} from './codemind-runtime-boundary.js'
import type { CodemindRuntimeAdapterDescriptor } from './codemind-runtime.types.js'

function makeDescriptor(
  overrides: Partial<CodemindRuntimeAdapterDescriptor> = {},
): CodemindRuntimeAdapterDescriptor {
  return {
    adapterId: 'runtime-adapter-1',
    adapterKind: 'GITHUB_PR_CONTEXT_READER',
    executionMode: 'READ_ONLY',
    capabilityFlags: createReadOnlyRuntimeCapabilityFlags(),
    permissionRequest: {
      requestId: 'runtime-permission-1',
      sessionId: 'session-1',
      mode: 'READ_ONLY',
      toolCategory: 'GITHUB_READER',
      action: 'read pull request context',
      targets: [
        {
          kind: 'github-resource',
          value: 'JLPARTIN/JLPARTIN-CodeMind/pull/8',
        },
      ],
      sourceTrustZone: 'OPERATOR_SESSION',
      operatorApproved: true,
    },
    ...overrides,
  }
}

describe('CodeMind runtime boundary', () => {
  it('allows approved read-only adapter descriptors', () => {
    const decision = evaluateCodemindRuntimeBoundary(makeDescriptor())

    expect(decision.allowedToRun).toBe(true)
    expect(decision.permissionDecision.disposition).toBe('ALLOW')
    expect(decision.blockedReasons).toEqual([])
    expect(decision.auditRequired).toBe(false)
  })

  it('does not allow unapproved adapter descriptors', () => {
    const decision = evaluateCodemindRuntimeBoundary(
      makeDescriptor({
        permissionRequest: {
          ...makeDescriptor().permissionRequest,
          operatorApproved: false,
        },
      }),
    )

    expect(decision.allowedToRun).toBe(false)
    expect(decision.permissionDecision.disposition).toBe('ASK')
    expect(decision.auditRequired).toBe(true)
  })

  it('does not allow descriptors with write-style capability flags enabled', () => {
    const decision = evaluateCodemindRuntimeBoundary(
      makeDescriptor({
        capabilityFlags: {
          ...createReadOnlyRuntimeCapabilityFlags(),
          githubWriteEnabled: true,
        },
      }),
    )

    expect(decision.allowedToRun).toBe(false)
    expect(decision.blockedReasons).toContain(
      'GitHub write capability is not enabled for this phase.',
    )
    expect(decision.auditRequired).toBe(true)
  })

  it('does not allow merge capability in the runtime boundary', () => {
    const decision = evaluateCodemindRuntimeBoundary(
      makeDescriptor({
        capabilityFlags: {
          ...createReadOnlyRuntimeCapabilityFlags(),
          mergeEnabled: true,
        },
      }),
    )

    expect(decision.allowedToRun).toBe(false)
    expect(decision.blockedReasons).toContain('Merge capability is not enabled for this phase.')
  })

  it('requires read-only execution mode when network runtime is enabled', () => {
    const decision = evaluateCodemindRuntimeBoundary(
      makeDescriptor({
        executionMode: 'APPROVAL_REQUIRED',
        capabilityFlags: {
          ...createReadOnlyRuntimeCapabilityFlags(),
          networkRuntimeEnabled: true,
        },
      }),
    )

    expect(decision.allowedToRun).toBe(false)
    expect(decision.blockedReasons).toContain(
      'Network runtime requires READ_ONLY execution mode in this phase.',
    )
  })
})
