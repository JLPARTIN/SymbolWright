import type { RuntimeAuditEvent, RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createAuditEvent } from '../runtime/audit/runtime-audit-log.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../runtime/types.js'

import { evaluateWebSearchAccess } from './web-policy.js'
import { redactWebText } from './web-redaction.js'
import {
  DuckDuckGoSearchProvider,
  type WebSearchProvider,
  type WebSearchResultItem,
} from './web-search-provider.js'
import type { WebConfig } from './web-config.js'

export type WebSearchStatus = 'ok' | 'blocked' | 'transport_error'

/** Evidence-shaped result of one web_search call. */
export interface WebSearchEvidence {
  readonly tool: 'web_search'
  readonly query: string
  readonly provider: string
  readonly status: WebSearchStatus
  readonly results: readonly WebSearchResultItem[]
  readonly fetchedAt: string
  readonly durationMs: number
  readonly reason?: string
  readonly auditTrace: readonly RuntimeAuditEvent[]
}

export interface WebSearchRequest {
  readonly query: string
  readonly webConfig: WebConfig
  readonly runtimePolicy: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
  readonly auditLog?: RuntimeAuditLog
  readonly provider?: WebSearchProvider
}

/**
 * The single web_search execution path: policy gate -> provider search ->
 * redact -> audit trace -> evidence-shaped output.
 */
export async function performWebSearch(request: WebSearchRequest): Promise<WebSearchEvidence> {
  const fetchedAt = new Date().toISOString()
  const startedAtMs = Date.now()
  const provider = request.provider ?? new DuckDuckGoSearchProvider()
  const action = `web_search:${provider.name}:${request.query}`
  const auditTrace: RuntimeAuditEvent[] = []

  const record = (event: RuntimeAuditEvent): void => {
    auditTrace.push(event)
    request.auditLog?.record(event)
  }

  const finish = (
    status: WebSearchStatus,
    results: readonly WebSearchResultItem[],
    reason?: string,
  ): WebSearchEvidence => ({
    tool: 'web_search',
    query: request.query,
    provider: provider.name,
    status,
    results,
    fetchedAt,
    durationMs: Date.now() - startedAtMs,
    ...(reason !== undefined ? { reason } : {}),
    auditTrace,
  })

  if (request.query.trim().length === 0) {
    const message = 'web_search requires a non-empty query.'
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('blocked', [], message)
  }

  const decision = evaluateWebSearchAccess(
    request.webConfig,
    request.runtimePolicy,
    request.approval,
  )
  if (!decision.allowed) {
    const message = decision.reason ?? 'Blocked by web access policy.'
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('blocked', [], message)
  }

  const result = await provider.search({
    query: request.query,
    maxResults: request.webConfig.search.maxResults,
    timeoutMs: request.webConfig.search.timeoutMs,
  })

  if (result.outcome === 'transport_error') {
    const message = result.reason ?? 'Search provider failed.'
    record(
      createAuditEvent({
        action,
        status: 'allowed',
        detail: `web_search transport_error: ${message}`,
      }),
    )
    return finish('transport_error', [], message)
  }

  const results = request.webConfig.redaction
    ? result.results.map((item) => ({
        ...item,
        title: redactWebText(item.title),
        snippet: redactWebText(item.snippet),
      }))
    : result.results

  record(
    createAuditEvent({
      action,
      status: 'allowed',
      detail: `web_search returned ${results.length} result(s) via ${provider.name}`,
    }),
  )

  return finish('ok', results)
}
