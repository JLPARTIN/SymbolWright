import { buildAjnaGithubCollectorSnapshotFromApiPayload } from './ajna-github-api-payload-adapter.js'
import type { AjnaGithubCollectorSnapshot } from './ajna-github-collector-contract.js'
import {
  collectAjnaGithubApiPayloadFromReadOnlyClient,
  type AjnaGithubReadOnlyClientPort,
} from './ajna-github-readonly-client-port.js'
import type {
  AjnaGithubReadOnlyCollectorPort,
  AjnaGithubReadOnlyCollectorRequest,
} from './ajna-github-readonly-collector-boundary.js'

export async function collectAjnaGithubSnapshotFromReadOnlyClient(
  client: AjnaGithubReadOnlyClientPort,
  request: AjnaGithubReadOnlyCollectorRequest,
): Promise<AjnaGithubCollectorSnapshot> {
  const payload = await collectAjnaGithubApiPayloadFromReadOnlyClient(client, request)
  return buildAjnaGithubCollectorSnapshotFromApiPayload(payload)
}

export function createAjnaGithubReadOnlyClientCollectorPort(
  client: AjnaGithubReadOnlyClientPort,
): AjnaGithubReadOnlyCollectorPort {
  return {
    collect: (request) => collectAjnaGithubSnapshotFromReadOnlyClient(client, request),
  }
}
