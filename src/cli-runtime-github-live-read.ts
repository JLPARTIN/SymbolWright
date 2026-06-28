import fs from 'node:fs'

import type { FakeLiveReadClientData } from './runtime/live-read/fake-live-read-client.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export type GitHubLiveReadMode = 'fixture' | 'live'

export interface GitHubLiveReadFixtureRequest {
  readonly mode: 'pr' | 'ci'
  readonly owner: string
  readonly repo: string
  readonly prNumber?: number
  readonly runId?: number
  readonly clientData: FakeLiveReadClientData
}

export async function renderRuntimeGitHubLiveRead(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as GitHubLiveReadFixtureRequest

  if (raw.mode !== 'pr' && raw.mode !== 'ci') {
    throw new Error('Fixture must specify mode: "pr" or "ci".')
  }

  const readMode: GitHubLiveReadMode = raw.clientData !== undefined ? 'fixture' : 'live'
  const registry = createFixtureRegistry('github_live_read', raw.clientData)
  const context = createFixtureContext(cwd)

  let output: string
  if (raw.mode === 'pr') {
    const tool = registry.getOrThrow('github_live_read_pr')
    output = await tool.execute(
      { owner: raw.owner, repo: raw.repo, prNumber: raw.prNumber },
      context,
    )
  } else {
    const tool = registry.getOrThrow('github_live_read_ci')
    output = await tool.execute({ owner: raw.owner, repo: raw.repo, runId: raw.runId }, context)
  }

  return `[GitHub Live Read — ${readMode} mode]\n\n${output}`
}
