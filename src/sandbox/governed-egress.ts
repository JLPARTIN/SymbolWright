import { createHash, randomUUID } from 'node:crypto'

import { EgressBrokerError, type EgressSessionResult } from './egress-broker.js'
import type { EgressPolicyLimits } from './egress-policy.js'
import type { ApplicationSandboxNetworkRuntime } from './sandbox-network-runtime.js'
import type { SandboxAuthorizationContext, SandboxPolicyReference } from './sandbox-policy-model.js'

const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const MAX_RENDERED_BODY_BYTES = 64 * 1024
const ALLOWED_INPUT_FIELDS = new Set(['url', 'method', 'headers', 'body', 'limits'])
const FORBIDDEN_INPUT_FIELDS = new Set([
  'sessionId',
  'policy',
  'policyId',
  'policyReference',
  'approval',
  'authorization',
  'grantId',
  'principalId',
  'workspaceId',
  'missionId',
  'stateRoot',
  'resolver',
  'requester',
  'proxy',
  'pinnedAddress',
])

export interface GovernedEgressRequest {
  readonly url: string
  readonly method?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  readonly limits?: Partial<EgressPolicyLimits>
}

export interface GovernedEgressResult {
  readonly status: 'completed' | 'denied'
  readonly decisionCode: string
  readonly reason: string
  readonly destinationHostname: string
  readonly destinationPathHash: string
  readonly policyReference?: SandboxPolicyReference
  readonly response?: EgressSessionResult
  readonly contentType?: string
  readonly bodyText?: string
  readonly bodySha256?: string
  readonly bodyTruncated?: boolean
}

export function parseGovernedEgressRequest(input: unknown): GovernedEgressRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('sandbox_egress_request input must be a JSON object.')
  }
  const record = input as Record<string, unknown>
  for (const field of Object.keys(record)) {
    if (FORBIDDEN_INPUT_FIELDS.has(field)) {
      throw new Error(`sandbox_egress_request rejects caller-controlled authority field: ${field}`)
    }
    if (!ALLOWED_INPUT_FIELDS.has(field)) {
      throw new Error(`sandbox_egress_request rejects unknown request field: ${field}`)
    }
  }
  if (typeof record['url'] !== 'string' || record['url'].trim().length === 0) {
    throw new Error('sandbox_egress_request requires a non-empty url string.')
  }
  if (record['url'].length > 8192) throw new Error('sandbox_egress_request url is too long.')
  try {
    new URL(record['url'])
  } catch {
    throw new Error('sandbox_egress_request url must be an absolute URL.')
  }
  const method = optionalString(record['method'], 'method')?.toUpperCase()
  const headers = optionalHeaders(record['headers'])
  const body = optionalString(record['body'], 'body')
  if (body !== undefined && Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw new Error(`sandbox_egress_request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`)
  }
  const limits = optionalLimits(record['limits'])
  return {
    url: record['url'],
    ...(method === undefined ? {} : { method }),
    ...(headers === undefined ? {} : { headers }),
    ...(body === undefined ? {} : { body }),
    ...(limits === undefined ? {} : { limits }),
  }
}

export async function requestGovernedEgress(input: {
  readonly runtime: ApplicationSandboxNetworkRuntime
  readonly authorization: SandboxAuthorizationContext
  readonly request: GovernedEgressRequest
  readonly signal?: AbortSignal
}): Promise<GovernedEgressResult> {
  const destination = new URL(input.request.url)
  const common = {
    destinationHostname: destination.hostname,
    destinationPathHash: sha256(`${destination.pathname}${destination.search}`),
    ...(input.authorization.policyReference === undefined
      ? {}
      : { policyReference: input.authorization.policyReference }),
  }
  try {
    const response = await input.runtime.gateway.requestEgress({
      sessionId: randomUUID(),
      authorization: input.authorization,
      ...(input.request.limits === undefined
        ? {}
        : { policyRequest: { limits: input.request.limits } }),
      request: {
        url: input.request.url,
        ...(input.request.method === undefined ? {} : { method: input.request.method }),
        ...(input.request.headers === undefined ? {} : { headers: input.request.headers }),
        ...(input.request.body === undefined ? {} : { body: input.request.body }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    })
    const returnedBody = response.body.subarray(0, MAX_RENDERED_BODY_BYTES)
    const contentType = firstHeader(response.headers['content-type'])
    return {
      status: 'completed',
      decisionCode: 'EGRESS_REQUEST_ALLOWED',
      reason: 'The governed egress request completed.',
      ...common,
      response,
      ...(contentType === undefined ? {} : { contentType }),
      bodyText: new TextDecoder().decode(returnedBody),
      bodySha256: sha256Bytes(response.body),
      bodyTruncated: response.body.byteLength > returnedBody.byteLength,
    }
  } catch (error) {
    return {
      status: 'denied',
      decisionCode: error instanceof EgressBrokerError ? error.code : 'EGRESS_REQUEST_FAILED',
      reason: error instanceof Error ? error.message : String(error),
      ...common,
    }
  }
}

export function renderGovernedEgressResult(result: GovernedEgressResult): string {
  return JSON.stringify(
    {
      status: result.status,
      decisionCode: result.decisionCode,
      reason: result.reason,
      destinationHostname: result.destinationHostname,
      destinationPathHash: result.destinationPathHash,
      ...(result.policyReference === undefined ? {} : { policy: result.policyReference }),
      ...(result.response === undefined
        ? {}
        : {
            response: {
              statusCode: result.response.statusCode,
              finalUrl: result.response.finalUrl,
              requestCount: result.response.requestCount,
              bytesSent: result.response.bytesSent,
              bytesReceived: result.response.bytesReceived,
              ...(result.contentType === undefined ? {} : { contentType: result.contentType }),
              bodyText: result.bodyText,
              bodySha256: result.bodySha256,
              bodyTruncated: result.bodyTruncated,
            },
          }),
    },
    null,
    2,
  )
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${name} must be a string.`)
  return value
}

function optionalHeaders(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('headers must be a JSON object.')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > 64) throw new Error('headers may contain at most 64 entries.')
  const headers: Record<string, string> = {}
  for (const [name, entry] of entries) {
    if (typeof entry !== 'string') throw new Error(`Header ${name} must be a string.`)
    headers[name] = entry
  }
  return Object.freeze(headers)
}

function optionalLimits(value: unknown): Partial<EgressPolicyLimits> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('limits must be a JSON object.')
  }
  const allowed = new Set<keyof EgressPolicyLimits>([
    'maxRequests',
    'maxRequestBytes',
    'maxResponseBytes',
    'maxTotalSentBytes',
    'maxTotalReceivedBytes',
    'timeoutMs',
    'maxConcurrency',
    'maxRedirects',
  ])
  const result: Partial<Record<keyof EgressPolicyLimits, number>> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key as keyof EgressPolicyLimits)) throw new Error(`Unknown egress limit: ${key}`)
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry <= 0) {
      throw new Error(`Egress limit ${key} must be a positive number.`)
    }
    result[key as keyof EgressPolicyLimits] = Math.floor(entry)
  }
  return result
}

function firstHeader(value: string | readonly string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
