import { describe, expect, it } from 'vitest'

import { classifyChangedFile, normalizeRepoPath } from './file-classifier.js'

describe('forensic file classifier', () => {
  it('normalizes Windows paths', () => {
    expect(normalizeRepoPath('src\\runtime\\sandbox\\sandbox-runner.spec.ts')).toBe(
      'src/runtime/sandbox/sandbox-runner.spec.ts',
    )
  })

  it('classifies required CodeMind paths deterministically', () => {
    expect(classifyChangedFile('src/runtime/sandbox/sandbox-runner.ts').kind).toBe('source')
    expect(classifyChangedFile('src/runtime/sandbox/sandbox-runner.spec.ts').kind).toBe('test')
    expect(classifyChangedFile('package.json').kind).toBe('package-metadata')
    expect(classifyChangedFile('package-lock.json').kind).toBe('lockfile')
    expect(classifyChangedFile('pnpm-lock.yaml').kind).toBe('lockfile')
    expect(classifyChangedFile('yarn.lock').kind).toBe('lockfile')
    expect(classifyChangedFile('.github/workflows/ci.yml').kind).toBe('workflow')
    expect(classifyChangedFile('README.md').kind).toBe('documentation')
    expect(classifyChangedFile('unknown.custom').kind).toBe('unknown')
  })

  it('requires format validation for spec and workflow files', () => {
    expect(classifyChangedFile('src/runtime/sandbox/sandbox-runner.spec.ts')).toMatchObject({
      kind: 'test',
      requiresFormat: true,
      requiresLint: true,
      requiresTypecheck: true,
      requiresTest: true,
    })

    expect(classifyChangedFile('.github/workflows/ci.yml')).toMatchObject({
      kind: 'workflow',
      requiresFormat: true,
      riskLevel: 'high',
      forensicGates: ['workflow-validation'],
    })
  })
})
