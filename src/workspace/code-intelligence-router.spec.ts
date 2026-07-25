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

  it('detects additional source-language signatures used by the router', () => {
    expect(detectSourceLanguageId('fn main() { println!("hi"); }')).toBe('rust')
    expect(detectSourceLanguageId('package main\nfunc main() {}')).toBe('go')
    expect(detectSourceLanguageId('#include <iostream>')).toBe('cpp')
    expect(detectSourceLanguageId('{"name":"SymbolWright"}')).toBe('json')
    expect(detectSourceLanguageId('console.log("fallback")')).toBe('javascript')
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

  it('defaults TypeScript translation targets back to JavaScript', () => {
    const plan = createCodeIntelligenceTaskPlan({
      kind: 'translate',
      sourceLanguageId: 'typescript',
      verificationStatus: 'TESTED',
    })

    expect(plan.targetLanguage?.id).toBe('javascript')
    expect(plan.verificationStatus).toBe('TESTED')
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

  it('covers generate, explain, and propose-tests routing branches', () => {
    const generatePlan = createCodeIntelligenceTaskPlan({
      kind: 'generate',
      selectedLanguageId: 'go',
      humanGoal: 'Write a CLI greeting.',
    })
    const explainPlan = createCodeIntelligenceTaskPlan({
      kind: 'explain',
      sourceLanguageId: 'javascript',
      code: 'console.log(1)',
    })
    const testsPlan = createCodeIntelligenceTaskPlan({
      kind: 'propose-tests',
      sourceLanguageId: 'python',
      code: '',
    })

    expect(generatePlan.steps.join('\n')).toContain('Generate code in Go')
    expect(explainPlan.steps.join('\n')).toContain('Explain JavaScript code')
    expect(testsPlan.steps.join('\n')).toContain('Propose deterministic unit tests')
    expect(testsPlan.assumptions.join('\n')).toContain('No source code was supplied')
  })

  it('reports same-language drift differently from cross-language drift', () => {
    const plan = createCodeIntelligenceTaskPlan({
      kind: 'compare-semantic-drift',
      sourceLanguageId: 'javascript',
      targetLanguageId: 'javascript',
    })

    expect(plan.semanticRisks).toEqual([
      'Source and target languages match; risk is refactor drift rather than cross-language runtime drift.',
    ])
  })
})
