import { describe, expect, it } from 'vitest'

import { getAjnaDocsReference, renderAjnaDocsReference } from './cli-ajna-docs.js'

describe('getAjnaDocsReference', () => {
  it('points to the Ajna docs hub and fixture index', () => {
    const reference = getAjnaDocsReference()

    expect(reference.hub).toBe('docs/ajna/CODEMIND_AJNA_DOCS_HUB.md')
    expect(reference.quickStart).toBe('docs/ajna-fixture-command-index.md')
  })

  it('lists planning docs before command docs', () => {
    const reference = getAjnaDocsReference()

    expect(reference.planningDocs).toEqual([
      'docs/ajna/CODEMIND_AJNA_ROADMAP.md',
      'docs/ajna/CODEMIND_AJNA_BUILD_PLAN.md',
    ])
    expect(reference.commandDocs).toContain('docs/ajna-client-collector-fixture-command.md')
  })

  it('keeps the command boundary local and non-mutating', () => {
    expect(getAjnaDocsReference().boundary).toEqual([
      'local-first documentation reference only',
      'no live GitHub ingestion',
      'no provider calls',
      'no PR comments',
      'no repository mutation',
    ])
  })
})

describe('renderAjnaDocsReference', () => {
  it('renders an operator-readable docs reference', () => {
    const output = renderAjnaDocsReference()

    expect(output).toContain('Ajna docs reference')
    expect(output).toContain('Hub: docs/ajna/CODEMIND_AJNA_DOCS_HUB.md')
    expect(output).toContain('Quick start: docs/ajna-fixture-command-index.md')
    expect(output).toContain('Planning docs:')
    expect(output).toContain('Command docs:')
    expect(output).toContain('Boundary:')
  })
})
