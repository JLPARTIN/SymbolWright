import { describe, expect, it } from 'vitest'

import {
  createCodeIntelligenceTaskPlan,
  detectSourceLanguageId,
} from './code-intelligence-router.js'

describe('code intelligence task router', () => {
  it('detects common source languages without claiming model certainty', () => {
    expect(detectSourceLanguageId('type User = { name: string }')).toBe('typescript')
    expect(detectSourceLanguageId('def greet(name):\n    print(name)')).toBe('python')
    expect(detectSourceLanguageId('SELECT * FROM users')).toBe('sql')
    expect(detectSourceLanguageId('<style>body{}</style>')).toBe('html')
  })

  it('builds the required structured translation flow and keeps the result UNVERIFIED by default', () => {
    const plan = createCodeIntelligenceTaskPlan({
      kind: 'translate',
      code: 'function add(a, b) { return a + b }',
      targetLanguageId: 'typescript',
    })

    expect(plan.verificationStatus).toBe('UNVERIFIED')
    expect(plan.sourceLanguage.id).toBe('javascript')
    expect(plan.targetLanguage?.id).toBe('typescript')
    expect(plan.steps).toEqual(
      expect.arrayContaining([
        'Extract behavior and externally visible side effects before generating code.',
        'Generate target-language tests from the extracted behavior/specification.',
      ]),
    )
    expect(plan.prompt).toContain('never claim equivalence unless tests actually run')
  })

  it('defaults translation target from the dropdown/registry when none is supplied', () => {
    const plan = createCodeIntelligenceTaskPlan({
      kind: 'translate',
      code: 'const x = 1',
    })

    expect(plan.targetLanguage?.id).toBe('typescript')
    expect(plan.verificationStatus).toBe('UNVERIFIED')
  })

  it('surfaces semantic drift risks separately from normal review tasks', () => {
    const driftPlan = createCodeIntelligenceTaskPlan({
      kind: 'compare-semantic-drift',
      sourceLanguageId: 'javascript',
      targetLanguageId: 'python',
    })
    const reviewPlan = createCodeIntelligenceTaskPlan({
      kind: 'review',
      sourceLanguageId: 'javascript',
    })

    expect(driftPlan.semanticRisks.length).toBeGreaterThan(0)
    expect(reviewPlan.semanticRisks).toEqual([])
  })
})
