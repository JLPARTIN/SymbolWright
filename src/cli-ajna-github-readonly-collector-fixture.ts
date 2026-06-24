import { readFileSync } from 'fs'

import type { AjnaGithubCollectorSnapshot } from './ajna/ajna-github-collector-contract.js'
import {
  collectAjnaGithubReadOnlySnapshot,
  validateAjnaGithubReadOnlyCollectorRequest,
  type AjnaGithubReadOnlyCollectorPort,
  type AjnaGithubReadOnlyCollectorRequest,
} from './ajna/ajna-github-readonly-collector-boundary.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAjnaGithubReadOnlyCollectorRequest(jsonText: string): AjnaGithubReadOnlyCollectorRequest {
  const parsed = JSON.parse(jsonText) as unknown
  if (!isRecord(parsed)) {
    throw new Error('Ajna GitHub read-only collector request fixture must be an object.')
  }
  return validateAjnaGithubReadOnlyCollectorRequest(parsed as unknown as AjnaGithubReadOnlyCollectorRequest)
}

export function createAjnaGithubReadOnlyFixturePort(): AjnaGithubReadOnlyCollectorPort {
  return {
    collect: async (request) => ({
      pullRequest: {
        repository: request.repository,
        pullRequestNumber: request.pullRequestNumber,
        baseRef: 'main',
        headRef: `fixture-pr-${request.pullRequestNumber}`,
      },
      changedFiles: [
        {
          path: 'examples/ajna/github-readonly-collector-request.ready.json',
          status: 'modified',
        },
      ],
      checkRuns: [],
    }),
  }
}

export async function buildAjnaGithubReadOnlyCollectorFixtureSnapshotForFile(
  inputPath: string,
  port: AjnaGithubReadOnlyCollectorPort = createAjnaGithubReadOnlyFixturePort(),
): Promise<AjnaGithubCollectorSnapshot> {
  const request = parseAjnaGithubReadOnlyCollectorRequest(readFileSync(inputPath, 'utf-8'))
  return collectAjnaGithubReadOnlySnapshot(port, request)
}

export async function renderAjnaGithubReadOnlyCollectorFixtureForFile(inputPath: string): Promise<string> {
  const snapshot = await buildAjnaGithubReadOnlyCollectorFixtureSnapshotForFile(inputPath)
  return JSON.stringify(snapshot, null, 2)
}
