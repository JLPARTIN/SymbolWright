import { loadMcpConfig } from '../../mcp/mcp-config.js'
import { callMcpTool, type McpCallEvidence } from '../../mcp/mcp-runtime.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

export interface McpCallToolInput {
  readonly server: string
  readonly tool: string
  readonly arguments?: Readonly<Record<string, unknown>>
  readonly timeoutMs?: number
  /** Overrides the default `.codemind/mcp.json` lookup — mainly for tests/fixtures. */
  readonly configPath?: string
}

function parseMcpCallInput(input: unknown): McpCallToolInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('mcp_call requires an object input with "server" and "tool" fields')
  }
  const raw = input as Record<string, unknown>

  if (typeof raw['server'] !== 'string' || raw['server'].trim().length === 0) {
    throw new Error('mcp_call requires a non-empty "server" string')
  }
  if (typeof raw['tool'] !== 'string' || raw['tool'].trim().length === 0) {
    throw new Error('mcp_call requires a non-empty "tool" string')
  }

  const parsedArguments =
    typeof raw['arguments'] === 'object' && raw['arguments'] !== null
      ? (raw['arguments'] as Record<string, unknown>)
      : undefined

  return {
    server: raw['server'],
    tool: raw['tool'],
    ...(parsedArguments !== undefined ? { arguments: parsedArguments } : {}),
    ...(typeof raw['timeoutMs'] === 'number' ? { timeoutMs: raw['timeoutMs'] } : {}),
    ...(typeof raw['configPath'] === 'string' ? { configPath: raw['configPath'] } : {}),
  }
}

export function renderMcpCallEvidence(evidence: McpCallEvidence): string {
  const lines = [
    'CodeMind mcp_call',
    '',
    `Server: ${evidence.server}`,
    `Tool: ${evidence.toolName}`,
    `Status: ${evidence.status}`,
    `Duration: ${evidence.durationMs}ms`,
  ]

  for (const block of evidence.content) {
    if (block.text !== undefined) {
      lines.push('', block.text)
    }
  }

  if (evidence.stderrLog.trim().length > 0) {
    lines.push('', 'stderr:', evidence.stderrLog.trim())
  }

  lines.push(
    '',
    'Audit trace:',
    ...evidence.auditTrace.map(
      (event) => `- [${event.timestamp}] ${event.status.toUpperCase()} ${event.action}: ${event.detail}`,
    ),
  )

  return lines.join('\n')
}

export async function executeMcpCallTool(
  input: McpCallToolInput,
  context: RuntimeToolContext,
): Promise<string> {
  const config = loadMcpConfig(context.cwd, input.configPath)

  const evidence = await callMcpTool({
    config,
    policy: context.policy,
    server: input.server,
    toolName: input.tool,
    arguments: input.arguments ?? {},
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
  })

  return renderMcpCallEvidence(evidence)
}

export const mcpCallTool: RuntimeToolDefinition = {
  name: 'mcp_call',
  description: 'Invoke a tool on a configured MCP stdio server through the CodeMind policy gate.',
  capability: 'MCP_TOOL',
  execute: async (input, context) => executeMcpCallTool(parseMcpCallInput(input), context),
}
