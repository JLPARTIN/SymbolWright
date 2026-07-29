import { loadWebConfig } from '../../web/web-config.js'
import { performWebFetch, type WebFetchEvidence } from '../../web/web-fetch.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { assertTrustedOperatorResearchNetwork } from './operator-research-network.js'

export interface WebFetchToolInput {
  readonly url: string
  /** Overrides the default `.symbolwright/config.json` lookup — mainly for tests/fixtures. */
  readonly configPath?: string
}

function parseWebFetchInput(input: unknown): WebFetchToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('web_fetch requires an object input with a "url" field')
  }
  const raw = input as Record<string, unknown>

  if (typeof raw['url'] !== 'string' || raw['url'].trim().length === 0) {
    throw new Error('web_fetch requires a non-empty "url" string')
  }

  return {
    url: raw['url'],
    ...(typeof raw['configPath'] === 'string' ? { configPath: raw['configPath'] } : {}),
  }
}

export function renderWebFetchEvidence(evidence: WebFetchEvidence): string {
  const lines = [
    'SymbolWright web_fetch',
    '',
    `URL: ${evidence.url}`,
    ...(evidence.finalUrl !== evidence.url ? [`Final URL: ${evidence.finalUrl}`] : []),
    `Status: ${evidence.status}`,
    ...(evidence.httpStatus !== undefined ? [`HTTP status: ${evidence.httpStatus}`] : []),
    ...(evidence.contentType !== undefined ? [`Content-Type: ${evidence.contentType}`] : []),
    `Duration: ${evidence.durationMs}ms`,
  ]

  if (evidence.title !== undefined) {
    lines.push('', `Title: ${evidence.title}`)
  }
  if (evidence.excerpt !== undefined) {
    lines.push('', 'Excerpt:', evidence.excerpt)
  }
  if (evidence.hash !== undefined) {
    lines.push('', `SHA-256: ${evidence.hash}`)
  }
  if (evidence.truncated) {
    lines.push('', '(content truncated at maxBytes)')
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

export async function executeWebFetchTool(
  input: WebFetchToolInput,
  context: RuntimeToolContext,
): Promise<string> {
  assertTrustedOperatorResearchNetwork(context, 'web_fetch')
  const webConfig = loadWebConfig(context.cwd, {
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
  })

  const evidence = await performWebFetch({
    url: input.url,
    webConfig,
    runtimePolicy: context.policy,
    ...(context.approval !== undefined ? { approval: context.approval } : {}),
  })

  return renderWebFetchEvidence(evidence)
}

export const webFetchTool: RuntimeToolDefinition = {
  name: 'web_fetch',
  description:
    'Trusted local-operator web research. Delegated callers are denied and must use the governed SandboxNetworkGateway egress path.',
  capability: 'WEB_ACCESS',
  execute: async (input, context) => executeWebFetchTool(parseWebFetchInput(input), context),
}
