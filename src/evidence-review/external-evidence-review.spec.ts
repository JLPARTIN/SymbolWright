import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const WORKSPACE = path.resolve(import.meta.dirname, '..', '..')
const REVIEW_PATH = path.join(
  WORKSPACE,
  'docs',
  'build-state',
  'CODEMIND_EXTERNAL_EVIDENCE_REVIEW.md',
)

describe('external evidence review record', () => {
  it('records the PromptOps partial-evidence snapshot and closure decision', () => {
    const content = fs.readFileSync(REVIEW_PATH, 'utf8')

    expect(content).toContain('f29cfdd770990e7c60c2dcfbe8dc784693fe9104')
    expect(content).toContain('merged PR history limited to 99 PRs across 5 pages')
    expect(content).toContain('changed files fetched for 10 of 99 merged PRs')
    expect(content).toContain('No runtime blocker was identified')
    expect(content).toContain(
      'No CodeMind source change is required to satisfy the external evidence limitation',
    )
  })
})
