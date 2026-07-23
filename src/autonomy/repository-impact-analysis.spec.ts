import { describe, expect, it } from 'vitest'

import { analyzeRepositoryImpact } from './repository-impact-analysis.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

function snapshot(): RepositorySemanticIndexSnapshot {
  return {
    schemaVersion: 1,
    repositoryRoot: '/repo',
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
    files: [
      file('src/core.ts', 'core'),
      file('src/service.ts', 'services'),
      file('src/api.ts', 'api'),
      file('src/isolated.ts', 'core'),
    ],
    symbols: [
      {
        id: 'core:run',
        name: 'runCore',
        kind: 'function',
        filePath: 'src/core.ts',
        line: 1,
        exported: true,
      },
      {
        id: 'isolated:value',
        name: 'isolatedValue',
        kind: 'variable',
        filePath: 'src/isolated.ts',
        line: 1,
        exported: false,
      },
    ],
    imports: [
      { filePath: 'src/service.ts', source: './core.js', names: ['runCore'] },
      { filePath: 'src/api.ts', source: './service.js', names: ['service'] },
    ],
    references: [],
  }
}

function file(path: string, packageOwner: string) {
  return {
    path,
    language: 'typescript',
    contentHash: path,
    generated: false,
    packageOwner,
    indexedAt: '2026-07-23T00:00:00.000Z',
  }
}

describe('analyzeRepositoryImpact', () => {
  it('traces direct and transitive reverse import dependencies', () => {
    const result = analyzeRepositoryImpact(snapshot(), ['src/core.ts'])

    expect(result.directlyAffectedFiles).toEqual(['src/service.ts'])
    expect(result.transitivelyAffectedFiles).toEqual(['src/api.ts'])
    expect(result.affectedPackages).toEqual(['api', 'core', 'services'])
    expect(result.affectedExportedSymbols).toEqual(['runCore'])
    expect(result.risk).toBe('medium')
    expect(result.reasons).toContain('1 direct importers are affected.')
  })

  it('resolves extension-rewritten relative imports', () => {
    const result = analyzeRepositoryImpact(snapshot(), ['./src/service.ts'])

    expect(result.changedFiles).toEqual(['src/service.ts'])
    expect(result.directlyAffectedFiles).toEqual(['src/api.ts'])
  })

  it('reports isolated indexed changes as low risk', () => {
    const result = analyzeRepositoryImpact(snapshot(), ['src/isolated.ts'])

    expect(result.risk).toBe('low')
    expect(result.directlyAffectedFiles).toEqual([])
    expect(result.transitivelyAffectedFiles).toEqual([])
    expect(result.reasons).toEqual([
      'The change is isolated to indexed files with no known importers.',
    ])
  })

  it('raises risk for unknown files and accepts custom validation commands', () => {
    const result = analyzeRepositoryImpact(snapshot(), ['scripts/new-tool.ts'], {
      validationCommands: ['npm test', 'npm run typecheck', 'npm test'],
    })

    expect(result.riskScore).toBe(15)
    expect(result.validationCommands).toEqual(['npm run typecheck', 'npm test'])
    expect(result.reasons).toContain('1 changed files are absent from the semantic index.')
  })

  it('limits traversal depth', () => {
    const result = analyzeRepositoryImpact(snapshot(), ['src/core.ts'], { maxTraversalDepth: 1 })

    expect(result.directlyAffectedFiles).toEqual(['src/service.ts'])
    expect(result.transitivelyAffectedFiles).toEqual([])
  })
})
