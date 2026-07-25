import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createFixtureContext } from '../registry/fixture-registry-factory.js'

import {
  executeGitHubPrFixtureReviewTool,
  executeGitHubCiFixtureReviewTool,
} from './github-fixture-tools.js'

function writeTempFixture(data: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-fixture-'))
  const filePath = path.join(dir, 'fixture.json')
  fs.writeFileSync(filePath, JSON.stringify(data))
  return filePath
}

const PR_FIXTURE = {
  pr: {
    number: 42,
    title: 'Add feature X',
    state: 'open',
    base: 'main',
    head: 'feature/x',
    additions: 100,
    deletions: 20,
    changedFiles: ['src/index.ts', 'src/utils.ts'],
  },
}

const CI_FIXTURE = {
  ci: {
    workflowName: 'CI',
    runNumber: 1,
    status: 'completed',
    conclusion: 'success',
    branch: 'feature/x',
    event: 'push',
    jobs: [
      {
        name: 'test',
        status: 'completed',
        conclusion: 'success',
        steps: [{ name: 'Run tests', status: 'completed', conclusion: 'success' }],
      },
    ],
  },
}

describe('executeGitHubPrFixtureReviewTool', () => {
  it('reviews PR fixture and returns formatted output', async () => {
    const fixturePath = writeTempFixture(PR_FIXTURE)
    const output = await executeGitHubPrFixtureReviewTool(
      { path: fixturePath },
      createFixtureContext(),
    )

    expect(output).toContain('SymbolWright GitHub PR fixture review')
    expect(output).toContain('Ajna bridge verdict:')
    expect(output).toContain('local fixture only')
    expect(output).toContain('no GitHub API call')
  })

  it('throws when fixture is missing pr evidence', async () => {
    const fixturePath = writeTempFixture({ ci: CI_FIXTURE.ci })

    await expect(
      executeGitHubPrFixtureReviewTool({ path: fixturePath }, createFixtureContext()),
    ).rejects.toThrow('missing pr evidence')
  })

  it('includes boundary assertions', async () => {
    const fixturePath = writeTempFixture(PR_FIXTURE)
    const output = await executeGitHubPrFixtureReviewTool(
      { path: fixturePath },
      createFixtureContext(),
    )

    expect(output).toContain('no comments')
    expect(output).toContain('no approvals')
    expect(output).toContain('no merges')
  })
})

describe('executeGitHubCiFixtureReviewTool', () => {
  it('reviews CI fixture and returns formatted output', async () => {
    const fixturePath = writeTempFixture(CI_FIXTURE)
    const output = await executeGitHubCiFixtureReviewTool(
      { path: fixturePath },
      createFixtureContext(),
    )

    expect(output).toContain('SymbolWright GitHub CI fixture review')
    expect(output).toContain('Ajna bridge verdict:')
    expect(output).toContain('local fixture only')
  })

  it('throws when fixture is missing ci evidence', async () => {
    const fixturePath = writeTempFixture({ pr: PR_FIXTURE.pr })

    await expect(
      executeGitHubCiFixtureReviewTool({ path: fixturePath }, createFixtureContext()),
    ).rejects.toThrow('missing ci evidence')
  })

  it('includes boundary assertions', async () => {
    const fixturePath = writeTempFixture(CI_FIXTURE)
    const output = await executeGitHubCiFixtureReviewTool(
      { path: fixturePath },
      createFixtureContext(),
    )

    expect(output).toContain('no workflow rerun')
    expect(output).toContain('no comments')
    expect(output).toContain('no approvals')
  })
})
