import { loadWebConfig } from '../../web/web-config.js'
import { performWebSearch, type WebSearchEvidence } from '../../web/web-search.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface WebSearchToolInput {
  readonly query: string
  /** Overrides the default `.symbolwright/config.json` lookup — mainly for tests/fixtures. */
  readonly configPath?: string
}

function parseWebSearchInput(input: unknown): WebSearchToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('web_search requires an object input with a "query" field')
  }
  const raw = input as Record<string, unknown>

  if (typeof raw['query'] !== 'string' || raw['query'].trim().length === 0) {
    throw new Error('web_search requires a non-empty "query" string')
  }

  return {
    query: raw['query'],
    ...(typeof raw['configPath'] === 'string' ? { configPath: raw['configPath'] } : {}),
  }
}

export function renderWebSearchEvidence(evidence: WebSearchEvidence): string {
  const lines = [
    'SymbolWright web_search',
    '',
    `Query: ${evidence.query}`,
    `Provider: ${evidence.provider}`,
    `Status: ${evidence.status}`,
    `Duration: ${evidence.durationMs}ms`,
  ]

  if (evidence.results.length > 0) {
    lines.push('', 'Results:')
    evidence.results.forEach((result, index) => {
      lines.push(`${index + 1}. ${result.title}`, `   ${result.url}`, `   ${result.snippet}`)
    })
  }

  if (evidence.reason !== undefined) {
    lines.push('', `Reason: ${evidence.reason}`)
  }

  lines.push(
    '',
    'Audit trace:',
    ...evidence.auditTrace.map(
      (event) =>
        `- [${event.timestamp}] ${event.status.toUpperCase()} ${event.action}: ${event.detail}`,
    ),
  )

  return lines.join('\n')
}

export async function executeWebSearchTool(
  input: WebSearchToolInput,
  context: RuntimeToolContext,
): Promise<string> {
  const webConfig = loadWebConfig(context.cwd, {
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
  })

  const evidence = await performWebSearch({
    query: input.query,
    webConfig,
    runtimePolicy: context.policy,
    ...(context.approval !== undefined ? { approval: context.approval } : {}),
  })

  return renderWebSearchEvidence(evidence)
}

export const webSearchTool: RuntimeToolDefinition = {
  name: 'web_search',
  description:
    'Search the public web through the SymbolWright policy gate. Works out of the box with a default DuckDuckGo adapter, no API key required.',
  capability: 'WEB_ACCESS',
  execute: async (input, context) => executeWebSearchTool(parseWebSearchInput(input), context),
}
