import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { adaptGitHubCiFixture } from './github-ci-read-adapter.js'
import { adaptGitHubPrFixture } from './github-pr-read-adapter.js'
import { bridgeRuntimeEvidenceToAjna } from '../ajna/runtime-ajna-evidence-bridge.js'
import { buildCiEvidenceSummary } from '../evidence/ci-evidence-summary.js'
import { buildPrEvidenceSummary } from '../evidence/pr-evidence-builder.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from '../registry/fixture-registry-factory.js'

function createFixtureFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-gh-fixture-'))
  const file = path.join(dir, 'fixture.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      pr: {
        number: 89,
        title: 'Phase D approval gates',
        state: 'closed',
        merged: true,
        base: 'main',
        head: 'phase-d-approval-gates-audit',
        changedFiles: ['src/runtime/audit/runtime-audit-log.ts'],
        additions: 606,
        deletions: 2,
      },
      ci: {
        workflow: 'Validate CodeMind',
        conclusion: 'success',
        jobs: [{ name: 'Typecheck', status: 'completed', conclusion: 'success' }],
      },
    }),
  )
  return file
}

describe('GitHub read fixture adapters', () => {
  it('adapts PR fixture evidence', () => {
    const evidence = adaptGitHubPrFixture({ number: 1, title: 'Test PR', state: 'open' })

    expect(evidence.base).toBe('main')
    expect(evidence.changedFiles).toEqual([])
  })

  it('adapts workflow fixture evidence', () => {
    const evidence = adaptGitHubCiFixture({ workflow: 'Validate CodeMind' })

    expect(evidence.conclusion).toBe('unknown')
    expect(evidence.jobs).toEqual([])
  })

  it('builds Ajna-ready evidence summaries', () => {
    const pr = buildPrEvidenceSummary(
      adaptGitHubPrFixture({ number: 2, title: 'Bundle', state: 'closed', merged: true }),
    )
    const ci = buildCiEvidenceSummary(
      adaptGitHubCiFixture({ workflow: 'Validate', conclusion: 'success' }),
    )
    const bridge = bridgeRuntimeEvidenceToAjna({ pr, ci })

    expect(bridge.verdict).toBe('READY')
    expect(bridge.notes.join('\n')).toContain('PR #2')
    expect(bridge.notes.join('\n')).toContain('Workflow Validate')
  })

  it('registers local fixture review tools', () => {
    const names = createFixtureRegistry('github_read')
      .list()
      .map((tool) => tool.name)

    expect(names).toContain('github_pr_fixture_review')
    expect(names).toContain('github_ci_fixture_review')
  })

  it('renders PR and workflow fixture reviews without mutation', async () => {
    const fixture = createFixtureFile()
    const registry = createFixtureRegistry('github_read')
    const context = createFixtureContext(process.cwd())

    const prOutput = await registry
      .getOrThrow('github_pr_fixture_review')
      .execute({ path: fixture }, context)
    const ciOutput = await registry
      .getOrThrow('github_ci_fixture_review')
      .execute({ path: fixture }, context)

    expect(prOutput).toContain('CodeMind GitHub PR fixture review')
    expect(prOutput).toContain('no comments')
    expect(ciOutput).toContain('CodeMind GitHub CI fixture review')
    expect(ciOutput).toContain('no workflow rerun')
  })
})
