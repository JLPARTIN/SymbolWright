import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { FakePrCollaborationClient } from './fake-pr-collaboration-client.js'
import { executePrCollaboration, renderPrCollaborationResult } from './pr-collaboration.js'

const policy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: true,
  protectedPaths: [],
  noisyDirs: [],
}

const approval: RuntimeApproval = {
  ticketId: 'Y-001',
  approvedBy: 'operator',
  scopes: ['github:write'],
}

describe('executePrCollaboration', () => {
  it('dry-runs without client operations', async () => {
    const client = new FakePrCollaborationClient()
    const result = await executePrCollaboration(
      {
        action: 'apply_label',
        repository: 'JLPARTIN/CodeMind',
        prNumber: 10,
        content: 'ready',
        reason: 'Record status',
        dryRun: true,
      },
      policy,
      approval,
      client,
    )

    expect(result.outcome).toBe('DRY_RUN')
    expect(client.operations).toHaveLength(0)
  })

  it('applies a fake-client label when approved', async () => {
    const client = new FakePrCollaborationClient()
    const result = await executePrCollaboration(
      {
        action: 'apply_label',
        repository: 'JLPARTIN/CodeMind',
        prNumber: 10,
        content: 'ready',
        reason: 'Record status',
        dryRun: false,
      },
      policy,
      approval,
      client,
    )

    expect(result.outcome).toBe('APPLIED')
    expect(client.operations.map((operation) => operation.type)).toEqual(['addLabel'])
  })

  it('renders result output', async () => {
    const client = new FakePrCollaborationClient()
    const result = await executePrCollaboration(
      {
        action: 'apply_label',
        repository: 'JLPARTIN/CodeMind',
        prNumber: 10,
        content: 'ready',
        reason: 'Record status',
        dryRun: true,
      },
      policy,
      approval,
      client,
    )

    expect(renderPrCollaborationResult(result)).toContain('CodeMind PR collaboration')
  })
})
