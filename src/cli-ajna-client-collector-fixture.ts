import { readFileSync } from 'fs'

import type { AjnaGithubReadOnlyClientPort } from './ajna/ajna-github-readonly-client-port.js'
import { createAjnaGithubReadOnlyClientCollectorPort } from './ajna/ajna-github-readonly-client-collector.js'
import {
  validateAjnaGithubReadOnlyCollectorRequest,
  type AjnaGithubReadOnlyCollectorRequest,
} from './ajna/ajna-github-readonly-collector-boundary.js'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAjnaClientCollectorFixtureRequest(
  jsonText: string,
): AjnaGithubReadOnlyCollectorRequest {
  const parsed = JSON.parse(jsonText) as unknown
  if (!isObject(parsed)) {
    throw new Error('Ajna client collector fixture request must be an object.')
  }
  return validateAjnaGithubReadOnlyCollectorRequest(
    parsed as unknown as AjnaGithubReadOnlyCollectorRequest,
  )
}

export function createAjnaClientCollectorFixtureClient(): AjnaGithubReadOnlyClientPort {
  return {
    getPullRequest: async (request) => ({
      repository: request.repository,
      number: request.pullRequestNumber,
      base: { ref: 'main' },
      head: { ref: `fixture-client-pr-${request.pullRequestNumber}` },
    }),
    listPullRequestFiles: async () => [
      {
        filename: 'src/ajna/ajna-github-readonly-client-collector.ts',
        status: 'modified',
      },
    ],
    listCheckRunsForRef: async () => [
      {
        name: 'Fixture Validate SymbolWright',
        status: 'completed',
        conclusion: 'success',
      },
    ],
  }
}

export async function renderAjnaClientCollectorFixtureForFile(
  inputPath: string,
  client: AjnaGithubReadOnlyClientPort = createAjnaClientCollectorFixtureClient(),
): Promise<string> {
  const request = parseAjnaClientCollectorFixtureRequest(readFileSync(inputPath, 'utf-8'))
  const collector = createAjnaGithubReadOnlyClientCollectorPort(client)
  const snapshot = await collector.collect(request)
  return JSON.stringify(snapshot, null, 2)
}
