import type { AjnaGithubCollectorSnapshot } from './ajna-github-collector-contract.js'

export interface AjnaGithubReadOnlyCollectorRequest {
  readonly repository: string
  readonly pullRequestNumber: number
}

export interface AjnaGithubReadOnlyCollectorPort {
  readonly collect: (request: AjnaGithubReadOnlyCollectorRequest) => Promise<AjnaGithubCollectorSnapshot>
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Ajna GitHub read-only collector request ${field} must be a non-empty string.`)
  }
}

function assertPositiveInteger(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Ajna GitHub read-only collector request ${field} must be a positive integer.`)
  }
}

export function validateAjnaGithubReadOnlyCollectorRequest(
  request: AjnaGithubReadOnlyCollectorRequest,
): AjnaGithubReadOnlyCollectorRequest {
  assertNonEmptyString(request.repository, 'repository')
  assertPositiveInteger(request.pullRequestNumber, 'pullRequestNumber')
  return request
}

export async function collectAjnaGithubReadOnlySnapshot(
  port: AjnaGithubReadOnlyCollectorPort,
  request: AjnaGithubReadOnlyCollectorRequest,
): Promise<AjnaGithubCollectorSnapshot> {
  const validRequest = validateAjnaGithubReadOnlyCollectorRequest(request)
  return port.collect(validRequest)
}
