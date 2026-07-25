import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { globToRegex, loadFailureLedger, matchFailureLedgerRules } from './failure-ledger.js'
import type { FailureLedger } from './types.js'

const roots: string[] = []

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-ledger-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, '.symbolwright'), { recursive: true })
  return root
}

function writeLedger(root: string, content: string): void {
  fs.writeFileSync(path.join(root, '.symbolwright', 'ci-failure-ledger.json'), content)
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('failure ledger', () => {
  it('blocks missing, malformed, and invalid ledger shapes', () => {
    const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-ledger-missing-'))
    roots.push(missingRoot)
    expect(loadFailureLedger(missingRoot)).toMatchObject({ ok: false })

    const malformedRoot = makeRoot()
    writeLedger(malformedRoot, '{ nope')
    expect(loadFailureLedger(malformedRoot)).toMatchObject({ ok: false })

    const invalidRoot = makeRoot()
    writeLedger(invalidRoot, JSON.stringify([]))
    expect(loadFailureLedger(invalidRoot)).toMatchObject({ ok: false })
  })

  it('loads valid schemaVersion and failures array shape', () => {
    const root = makeRoot()
    writeLedger(root, JSON.stringify({ schemaVersion: 1, failures: [] }))
    expect(loadFailureLedger(root)).toMatchObject({ ok: true })
  })

  it('uses placeholder-safe glob conversion for root and nested files', () => {
    expect(globToRegex('**/*.ts').test('index.ts')).toBe(true)
    expect(globToRegex('**/*.ts').test('src/index.ts')).toBe(true)
    expect(globToRegex('src/**/*.ts').test('src/index.ts')).toBe(true)
    expect(globToRegex('src/**/*.ts').test('src/runtime/index.ts')).toBe(true)
    expect(globToRegex('.github/workflows/*.yml').test('.github/workflows/ci.yml')).toBe(true)
  })

  it('matches only active failure records', () => {
    const ledger: FailureLedger = {
      schemaVersion: 1,
      failures: [
        {
          failureClass: 'FORMAT_CHECK_FAILURE',
          rootCause: 'format drift',
          preventionRule: 'run format:check',
          regressionTest: 'spec files require format check',
          firstSeen: '2026-06-30',
          status: 'active',
          affectedFilePatterns: ['**/*.spec.ts'],
        },
        {
          failureClass: 'INACTIVE_FAILURE',
          rootCause: 'inactive',
          preventionRule: 'none',
          regressionTest: 'none',
          firstSeen: '2026-06-30',
          status: 'inactive',
          affectedFilePatterns: ['**/*.spec.ts'],
        },
      ],
    }

    const matches = matchFailureLedgerRules(ledger, ['src/runtime/sandbox-runner.spec.ts'])
    expect(matches).toHaveLength(1)
    expect(matches[0]?.failureClass).toBe('FORMAT_CHECK_FAILURE')
  })
})
