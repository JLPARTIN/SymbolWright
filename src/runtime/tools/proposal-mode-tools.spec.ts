import { describe, expect, it } from 'vitest'

import { critiquePlanText } from '../ajna/plan-critique-bridge.js'
import { critiqueProposalText } from '../ajna/proposal-critique-bridge.js'
import {
  createProposalRuntimeContext,
  createProposalRuntimeRegistry,
} from '../runtime-proposal-registry.js'

describe('proposal mode runtime tools', () => {
  it('registers proposal mode tools after read-only tools', () => {
    const names = createProposalRuntimeRegistry()
      .list()
      .map((entry) => entry.name)

    expect(names).toContain('propose_edit')
    expect(names).toContain('pr_notes')
    expect(names).toContain('ci_review')
  })

  it('renders a patch proposal without applying changes', async () => {
    const tool = createProposalRuntimeRegistry().getOrThrow('propose_edit')
    const output = await tool.execute(
      { goal: 'add proposal renderer' },
      createProposalRuntimeContext('/workspace/codemind'),
    )

    expect(output).toContain('CodeMind patch proposal')
    expect(output).toContain('Goal: add proposal renderer')
    expect(output).toContain('no patch is applied')
    expect(output).toContain('no writes')
  })

  it('renders PR notes without posting them', async () => {
    const tool = createProposalRuntimeRegistry().getOrThrow('pr_notes')
    const output = await tool.execute(
      { focus: 'proposal mode' },
      createProposalRuntimeContext('/workspace/codemind'),
    )

    expect(output).toContain('CodeMind PR notes draft')
    expect(output).toContain('proposal mode')
    expect(output).toContain('No PR comment is posted.')
  })

  it('renders local CI review without querying services', async () => {
    const tool = createProposalRuntimeRegistry().getOrThrow('ci_review')
    const output = await tool.execute(
      { status: 'failed', source: 'local fixture', findings: ['typecheck failed'] },
      createProposalRuntimeContext('/workspace/codemind'),
    )

    expect(output).toContain('CodeMind CI review draft')
    expect(output).toContain('Status: failed')
    expect(output).toContain('typecheck failed')
    expect(output).toContain('does not query CI services')
  })

  it('critiques plan and proposal text deterministically', () => {
    expect(critiquePlanText('Plan\nBoundary:\nvalidation')).toEqual({
      verdict: 'READY',
      findings: [],
    })
    expect(critiqueProposalText('Proposal note: this is a planning artifact only')).toEqual({
      verdict: 'READY',
      findings: [],
    })
  })
})
