import fs from 'node:fs'

import type { FakeLiveReadClientData } from './runtime/live-read/fake-live-read-client.js'
import {
  createFixtureContext,
  createFixtureRegistry,
} from './runtime/registry/fixture-registry-factory.js'

export interface AjnaLiveReadFixtureRequest {
  readonly mode: 'review' | 'merge-readiness'
  readonly owner: string
  readonly repo: string
  readonly prNumber?: number
  readonly workflowRunId?: number
  readonly clientData: FakeLiveReadClientData
}

export async function renderRuntimeAjnaLiveRead(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<string> {
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as AjnaLiveReadFixtureRequest

  if (raw.mode !== 'review' && raw.mode !== 'merge-readiness') {
    throw new Error('Fixture must specify mode: "review" or "merge-readiness".')
  }

  const registry = createFixtureRegistry('ajna_live_read', raw.clientData)
  const context = createFixtureContext(cwd)

  if (raw.mode === 'review') {
    const tool = registry.getOrThrow('ajna_live_read_review')
    return tool.execute(
      {
        owner: raw.owner,
        repo: raw.repo,
        prNumber: raw.prNumber,
        workflowRunId: raw.workflowRunId,
      },
      context,
    )
  }

  const tool = registry.getOrThrow('ajna_live_read_merge_readiness')
  return tool.execute(
    { owner: raw.owner, repo: raw.repo, prNumber: raw.prNumber, workflowRunId: raw.workflowRunId },
    context,
  )
}
