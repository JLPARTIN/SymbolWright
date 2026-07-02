export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface HopValidation {
  readonly allowed: boolean
  readonly reason?: string
}

export interface WebFetchExecutionRequest {
  readonly url: string
  readonly timeoutMs: number
  readonly maxBytes: number
  readonly maxRedirects: number
  readonly allowedContentTypes: readonly string[]
  /** Re-checked before every hop (including the first), so a redirect can't bypass policy. */
  readonly validateHop: (url: URL) => HopValidation
}

export type WebFetchOutcome = 'ok' | 'blocked' | 'http_error' | 'transport_error'

export interface WebFetchExecutionResult {
  readonly outcome: WebFetchOutcome
  readonly requestedUrl: string
  readonly finalUrl: string
  readonly httpStatus?: number
  readonly contentType?: string
  readonly body: string
  readonly truncated: boolean
  readonly reason?: string
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const DEFAULT_USER_AGENT = 'CodeMind/1.0 (+https://github.com/jlpartin/codemind; web_fetch tool)'

function blockedResult(
  requestedUrl: string,
  finalUrl: string,
  reason: string,
): WebFetchExecutionResult {
  return { outcome: 'blocked', requestedUrl, finalUrl, body: '', truncated: false, reason }
}

async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<{ readonly text: string; readonly truncated: boolean }> {
  if (response.body === null) {
    const text = await response.text()
    const encoded = new TextEncoder().encode(text)
    if (encoded.byteLength <= maxBytes) {
      return { text, truncated: false }
    }
    return { text: new TextDecoder().decode(encoded.slice(0, maxBytes)), truncated: true }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value === undefined) continue

    if (total + value.byteLength > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total))
      total = maxBytes
      truncated = true
      await reader.cancel()
      break
    }
    chunks.push(value)
    total += value.byteLength
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { text: new TextDecoder('utf-8', { fatal: false }).decode(combined), truncated }
}

/**
 * Executes a policy-gated HTTP fetch: manual redirect following (each hop
 * re-validated via `validateHop` so a redirect can't smuggle the request
 * into a blocked target), a content-type allowlist, and a byte-capped body
 * read — all under one overall timeout.
 */
export async function executeWebFetch(
  request: WebFetchExecutionRequest,
  fetchImpl: FetchLike = fetch,
): Promise<WebFetchExecutionResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), request.timeoutMs)

  try {
    let currentUrl = request.url

    for (let hop = 0; hop <= request.maxRedirects; hop++) {
      let parsed: URL
      try {
        parsed = new URL(currentUrl)
      } catch {
        return blockedResult(request.url, currentUrl, `Invalid URL: ${currentUrl}`)
      }

      const hopDecision = request.validateHop(parsed)
      if (!hopDecision.allowed) {
        return blockedResult(
          request.url,
          currentUrl,
          hopDecision.reason ?? 'Blocked by web access policy.',
        )
      }

      let response: Response
      try {
        response = await fetchImpl(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': DEFAULT_USER_AGENT,
            accept:
              request.allowedContentTypes.length > 0
                ? request.allowedContentTypes.join(', ')
                : '*/*',
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          outcome: 'transport_error',
          requestedUrl: request.url,
          finalUrl: currentUrl,
          body: '',
          truncated: false,
          reason: controller.signal.aborted
            ? `Fetch timed out after ${request.timeoutMs}ms`
            : message,
        }
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location')
        if (location === null) {
          return {
            outcome: 'http_error',
            requestedUrl: request.url,
            finalUrl: currentUrl,
            httpStatus: response.status,
            body: '',
            truncated: false,
            reason: 'Redirect response had no Location header.',
          }
        }
        if (hop === request.maxRedirects) {
          return {
            outcome: 'http_error',
            requestedUrl: request.url,
            finalUrl: currentUrl,
            httpStatus: response.status,
            body: '',
            truncated: false,
            reason: `Exceeded maxRedirects (${request.maxRedirects}).`,
          }
        }
        currentUrl = new URL(location, currentUrl).toString()
        continue
      }

      const rawContentType = response.headers.get('content-type') ?? ''
      const contentType = (rawContentType.split(';')[0] ?? '').trim().toLowerCase()
      const contentTypeAllowed =
        request.allowedContentTypes.length === 0 ||
        request.allowedContentTypes.some((allowed) => allowed.toLowerCase() === contentType)

      if (!contentTypeAllowed) {
        return {
          outcome: 'blocked',
          requestedUrl: request.url,
          finalUrl: currentUrl,
          httpStatus: response.status,
          contentType,
          body: '',
          truncated: false,
          reason: `Content-Type "${contentType || 'unknown'}" is not in allowedContentTypes.`,
        }
      }

      const { text, truncated } = await readBodyCapped(response, request.maxBytes)

      return {
        outcome: response.ok ? 'ok' : 'http_error',
        requestedUrl: request.url,
        finalUrl: currentUrl,
        httpStatus: response.status,
        contentType,
        body: text,
        truncated,
      }
    }

    return blockedResult(
      request.url,
      currentUrl,
      `Exceeded maxRedirects (${request.maxRedirects}).`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      outcome: 'transport_error',
      requestedUrl: request.url,
      finalUrl: request.url,
      body: '',
      truncated: false,
      reason: controller.signal.aborted ? `Fetch timed out after ${request.timeoutMs}ms` : message,
    }
  } finally {
    clearTimeout(timer)
  }
}
