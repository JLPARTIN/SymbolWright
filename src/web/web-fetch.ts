import { createHash } from 'node:crypto'

import type { RuntimeAuditEvent } from '../runtime/audit/runtime-audit-log.js'
import { createAuditEvent } from '../runtime/audit/runtime-audit-log.js'
import type { RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../runtime/types.js'

import type { FetchLike } from './web-fetch-client.js'
import { executeWebFetch } from './web-fetch-client.js'
import { evaluateWebFetchAccess } from './web-policy.js'
import { redactWebText } from './web-redaction.js'
import type { WebConfig } from './web-config.js'

const EXCERPT_LENGTH = 500

export type WebFetchStatus = 'ok' | 'blocked' | 'http_error' | 'transport_error'

/** Evidence-shaped result of one web_fetch call, ready to render or hand back to an agent. */
export interface WebFetchEvidence {
  readonly tool: 'web_fetch'
  readonly url: string
  readonly finalUrl: string
  readonly status: WebFetchStatus
  readonly httpStatus?: number
  readonly contentType?: string
  readonly title?: string
  readonly excerpt?: string
  readonly hash?: string
  readonly truncated: boolean
  readonly fetchedAt: string
  readonly durationMs: number
  readonly reason?: string
  readonly auditTrace: readonly RuntimeAuditEvent[]
}

export interface WebFetchRequest {
  readonly url: string
  readonly webConfig: WebConfig
  readonly runtimePolicy: RuntimePolicySnapshot
  readonly approval?: RuntimeApproval
  readonly auditLog?: RuntimeAuditLog
  readonly fetchImpl?: FetchLike
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTitleAndExcerpt(
  body: string,
  contentType: string | undefined,
): { readonly title?: string; readonly excerpt?: string } {
  if (body.length === 0) return {}

  if (contentType?.includes('html') === true) {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)
    const title = match?.[1]?.replace(/\s+/g, ' ').trim()
    const excerpt = stripHtmlTags(body).slice(0, EXCERPT_LENGTH)
    return { ...(title !== undefined && title.length > 0 ? { title } : {}), excerpt }
  }

  return { excerpt: body.slice(0, EXCERPT_LENGTH).trim() }
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex')
}

/**
 * The single web_fetch execution path: policy gate (including a per-redirect-hop
 * re-check) -> HTTP fetch -> redact -> audit trace -> evidence-shaped output.
 */
export async function performWebFetch(request: WebFetchRequest): Promise<WebFetchEvidence> {
  const fetchedAt = new Date().toISOString()
  const startedAtMs = Date.now()
  const action = `web_fetch:${request.url}`
  const auditTrace: RuntimeAuditEvent[] = []

  const record = (event: RuntimeAuditEvent): void => {
    auditTrace.push(event)
    request.auditLog?.record(event)
  }

  const finish = (
    status: WebFetchStatus,
    finalUrl: string,
    fields: Partial<
      Pick<
        WebFetchEvidence,
        'httpStatus' | 'contentType' | 'title' | 'excerpt' | 'hash' | 'truncated' | 'reason'
      >
    > = {},
  ): WebFetchEvidence => ({
    tool: 'web_fetch',
    url: request.url,
    finalUrl,
    status,
    truncated: fields.truncated ?? false,
    fetchedAt,
    durationMs: Date.now() - startedAtMs,
    auditTrace,
    ...fields,
  })

  let parsedUrl: URL
  try {
    parsedUrl = new URL(request.url)
  } catch {
    const message = `Invalid URL: ${request.url}`
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('blocked', request.url, { reason: message })
  }

  const initialDecision = evaluateWebFetchAccess(
    parsedUrl,
    request.webConfig,
    request.runtimePolicy,
    request.approval,
  )
  if (!initialDecision.allowed) {
    const message = initialDecision.reason ?? 'Blocked by web access policy.'
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('blocked', request.url, { reason: message })
  }

  const result = await executeWebFetch(
    {
      url: request.url,
      timeoutMs: request.webConfig.fetch.timeoutMs,
      maxBytes: request.webConfig.fetch.maxBytes,
      maxRedirects: request.webConfig.fetch.maxRedirects,
      allowedContentTypes: request.webConfig.fetch.allowedContentTypes,
      validateHop: (url) =>
        evaluateWebFetchAccess(url, request.webConfig, request.runtimePolicy, request.approval),
    },
    request.fetchImpl,
  )

  if (result.outcome === 'blocked') {
    const message = result.reason ?? 'Blocked by web access policy.'
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish('blocked', result.finalUrl, {
      ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
      reason: message,
    })
  }

  const redactedBody = request.webConfig.redaction ? redactWebText(result.body) : result.body
  const { title, excerpt } = extractTitleAndExcerpt(redactedBody, result.contentType)
  const hash = result.body.length > 0 ? sha256Hex(result.body) : undefined

  record(
    createAuditEvent({
      action,
      status: 'allowed',
      detail:
        result.outcome === 'ok'
          ? `Fetched ${result.finalUrl} (${result.httpStatus ?? 'unknown status'})`
          : `web_fetch ${result.outcome}: ${result.reason ?? 'unknown error'}`,
    }),
  )

  return finish(result.outcome, result.finalUrl, {
    ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
    ...(result.contentType !== undefined ? { contentType: result.contentType } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(excerpt !== undefined ? { excerpt } : {}),
    ...(hash !== undefined ? { hash } : {}),
    truncated: result.truncated,
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  })
}
