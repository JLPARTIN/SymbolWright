import fs from 'node:fs'

import { adaptGitHubCiFixture, type GitHubCiFixture } from '../adapters/github-ci-read-adapter.js'
import { adaptGitHubPrFixture, type GitHubPrFixture } from '../adapters/github-pr-read-adapter.js'
import { bridgeRuntimeEvidenceToAjna } from '../ajna/runtime-ajna-evidence-bridge.js'
import { buildCiEvidenceSummary } from '../evidence/ci-evidence-summary.js'
import { buildPrEvidenceSummary } from '../evidence/pr-evidence-builder.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface GitHubFixtureInput {
  readonly path: string
}

interface CombinedFixture {
  readonly pr?: GitHubPrFixture
  readonly ci?: GitHubCiFixture
}

function parseFixtureInput(input: unknown): GitHubFixtureInput {
  if (typeof input !== 'object' || input === null || !('path' in input)) {
    throw new Error('Missing fixture path.')
  }

  const fixturePath = (input as { readonly path: unknown }).path
  if (typeof fixturePath !== 'string' || fixturePath.trim().length === 0) {
    throw new Error('Missing fixture path.')
  }

  return { path: fixturePath }
}

function readFixture(path: string): CombinedFixture {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as CombinedFixture
}

export async function executeGitHubPrFixtureReviewTool(
  input: GitHubFixtureInput,
  _context: RuntimeToolContext,
): Promise<string> {
  const fixture = readFixture(input.path)
  if (fixture.pr === undefined) {
    throw new Error('GitHub fixture is missing pr evidence.')
  }

  const summary = buildPrEvidenceSummary(adaptGitHubPrFixture(fixture.pr))
  const ajna = bridgeRuntimeEvidenceToAjna({ pr: summary })

  return [
    'CodeMind GitHub PR fixture review',
    '',
    summary.title,
    ...summary.lines.map((line) => `- ${line}`),
    '',
    `Ajna bridge verdict: ${ajna.verdict}`,
    '',
    'Boundary:',
    '- local fixture only',
    '- no GitHub API call',
    '- no comments',
    '- no approvals',
    '- no merges',
  ].join('\n')
}

export async function executeGitHubCiFixtureReviewTool(
  input: GitHubFixtureInput,
  _context: RuntimeToolContext,
): Promise<string> {
  const fixture = readFixture(input.path)
  if (fixture.ci === undefined) {
    throw new Error('GitHub fixture is missing ci evidence.')
  }

  const summary = buildCiEvidenceSummary(adaptGitHubCiFixture(fixture.ci))
  const ajna = bridgeRuntimeEvidenceToAjna({ ci: summary })

  return [
    'CodeMind GitHub CI fixture review',
    '',
    summary.title,
    ...summary.lines.map((line) => `- ${line}`),
    '',
    `Ajna bridge verdict: ${ajna.verdict}`,
    '',
    'Boundary:',
    '- local fixture only',
    '- no GitHub API call',
    '- no workflow rerun',
    '- no comments',
    '- no approvals',
  ].join('\n')
}

export const githubPrFixtureReviewTool: RuntimeToolDefinition = {
  name: 'github_pr_fixture_review',
  description: 'Review local GitHub PR fixture evidence without GitHub mutation.',
  capability: 'EVIDENCE_READ',
  execute: async (input, context) => executeGitHubPrFixtureReviewTool(parseFixtureInput(input), context),
}

export const githubCiFixtureReviewTool: RuntimeToolDefinition = {
  name: 'github_ci_fixture_review',
  description: 'Review local GitHub CI fixture evidence without GitHub mutation.',
  capability: 'EVIDENCE_READ',
  execute: async (input, context) => executeGitHubCiFixtureReviewTool(parseFixtureInput(input), context),
}
