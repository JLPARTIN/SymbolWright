import fs from 'node:fs'

import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export interface GitHubWriteProposalFixtureRequest {
  readonly action: string
  readonly repository: string
  readonly targetRef: string
  readonly content: string
  readonly reason: string
}

export async function renderRuntimeGitHubWriteProposal(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as GitHubWriteProposalFixtureRequest

  if (typeof raw.action !== 'string' || raw.action.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "action" field.')
  }

  if (typeof raw.repository !== 'string' || raw.repository.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "repository" field.')
  }

  if (typeof raw.reason !== 'string' || raw.reason.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "reason" field.')
  }

  const registry = createFixtureRegistry('github_write_proposal')
  const context = createFixtureContext(cwd)

  const tool = registry.getOrThrow('github_write_proposal')
  return tool.execute(
    {
      action: raw.action,
      repository: raw.repository,
      targetRef: raw.targetRef ?? '',
      content: raw.content ?? '',
      reason: raw.reason,
    },
    context,
  )
}
