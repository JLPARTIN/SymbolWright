import type { FetchLike } from './web-fetch-client.js'

export interface WebSearchResultItem {
  readonly title: string
  readonly url: string
  readonly snippet: string
}

export interface WebSearchProviderRequest {
  readonly query: string
  readonly maxResults: number
  readonly timeoutMs: number
}

export type WebSearchProviderOutcome = 'ok' | 'transport_error'

export interface WebSearchProviderResult {
  readonly outcome: WebSearchProviderOutcome
  readonly results: readonly WebSearchResultItem[]
  readonly reason?: string
}

export interface WebSearchProvider {
  readonly name: string
  search(request: WebSearchProviderRequest, fetchImpl?: FetchLike): Promise<WebSearchProviderResult>
}

const RESULT_LINK_PATTERN = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
const SNIPPET_PATTERN = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  mdash: '—',
  ndash: '–',
  nbsp: ' ',
  hellip: '…',
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/** DuckDuckGo's lightweight HTML results wrap the real target in a `uddg` redirect param. */
function resolveDdgTargetUrl(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com')
    const uddg = url.searchParams.get('uddg')
    return uddg !== null ? uddg : url.toString()
  } catch {
    return href
  }
}

/** Parses DuckDuckGo's server-rendered HTML results page. Exported for direct, offline testing. */
export function parseDuckDuckGoHtml(
  html: string,
  maxResults: number,
): readonly WebSearchResultItem[] {
  const titles: { readonly url: string; readonly title: string }[] = []

  RESULT_LINK_PATTERN.lastIndex = 0
  let linkMatch: RegExpExecArray | null
  while ((linkMatch = RESULT_LINK_PATTERN.exec(html)) !== null) {
    const href = linkMatch[1]
    const rawTitle = linkMatch[2]
    if (href === undefined || rawTitle === undefined) continue
    titles.push({ url: resolveDdgTargetUrl(href), title: stripTags(rawTitle) })
  }

  const snippets: string[] = []
  SNIPPET_PATTERN.lastIndex = 0
  let snippetMatch: RegExpExecArray | null
  while ((snippetMatch = SNIPPET_PATTERN.exec(html)) !== null) {
    const rawSnippet = snippetMatch[1]
    if (rawSnippet === undefined) continue
    snippets.push(stripTags(rawSnippet))
  }

  const results: WebSearchResultItem[] = []
  for (let i = 0; i < titles.length && results.length < maxResults; i++) {
    const entry = titles[i]
    if (entry === undefined || entry.title.length === 0) continue
    results.push({ title: entry.title, url: entry.url, snippet: snippets[i] ?? '' })
  }

  return results
}

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/'
const DEFAULT_USER_AGENT =
  'SymbolWright/1.0 (+https://github.com/jlpartin/symbolwright; web_search tool)'

/**
 * DuckDuckGo occasionally answers automated/datacenter traffic with an
 * anti-bot "anomaly" challenge page instead of results (still HTTP 200/202).
 * Silently parsing that as "0 results" would misreport a block as a real
 * empty answer, so it's detected and surfaced as a transport error instead.
 */
function looksLikeAntiBotChallenge(html: string): boolean {
  return html.includes('anomaly.js') || html.includes('id="challenge-form"')
}

/** Default zero-config search provider: DuckDuckGo's HTML/lightweight endpoint, no API key required. */
export class DuckDuckGoSearchProvider implements WebSearchProvider {
  readonly name = 'duckduckgo'

  async search(
    request: WebSearchProviderRequest,
    fetchImpl: FetchLike = fetch,
  ): Promise<WebSearchProviderResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), request.timeoutMs)

    try {
      const url = `${DDG_ENDPOINT}?q=${encodeURIComponent(request.query)}`
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'user-agent': DEFAULT_USER_AGENT, accept: 'text/html' },
      })

      if (!response.ok) {
        return {
          outcome: 'transport_error',
          results: [],
          reason: `DuckDuckGo returned HTTP ${response.status}`,
        }
      }

      const html = await response.text()
      if (looksLikeAntiBotChallenge(html)) {
        return {
          outcome: 'transport_error',
          results: [],
          reason:
            'DuckDuckGo returned an anti-automation challenge instead of results (common from shared/' +
            'datacenter IPs). Configure an alternate web.search.provider if this persists.',
        }
      }

      return { outcome: 'ok', results: parseDuckDuckGoHtml(html, request.maxResults) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        outcome: 'transport_error',
        results: [],
        reason: controller.signal.aborted
          ? `Search timed out after ${request.timeoutMs}ms`
          : message,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
