import fs from 'node:fs'

import type { FakeLiveReadClientData } from './runtime/live-read/fake-live-read-client.js'
import {
  createGitHubLiveReadRuntimeContext,
  createGitHubLiveReadRuntimeRegistry,
} from './runtime/runtime-github-live-read-registry.js'

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

  const registry = createGitHubLiveReadRuntimeRegistry(raw.clientData)
  const context = createGitHubLiveReadRuntimeContext(cwd)

  if (raw.mode === 'pr') {
    const tool = registry.getOrThrow('github_live_read_pr')
    return tool.execute({ owner: raw.owner, repo: raw.repo, prNumber: raw.prNumber }, context)
  }

  const tool = registry.getOrThrow('github_live_read_ci')
  return tool.execute({ owner: raw.owner, repo: raw.repo, runId: raw.runId }, context)
}
