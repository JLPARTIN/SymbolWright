import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'
import { renderMcpToolExecution } from '../mcp/mcp-runtime.js'
import type { McpToolCallInput } from '../mcp/mcp-types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMcpToolCallInput(input: unknown): McpToolCallInput {
  if (!isRecord(input)) {
    throw new Error('Missing MCP tool call input.')
  }

  const server = input['server']
  const tool = input['tool']
  const args = input['arguments']
  const configPath = input['configPath']

  if (typeof server !== 'string' || server.trim().length === 0) {
    throw new Error('Missing MCP server name.')
  }
  if (typeof tool !== 'string' || tool.trim().length === 0) {
    throw new Error('Missing MCP tool name.')
  }
  if (args !== undefined && !isRecord(args)) {
    throw new Error('MCP arguments must be a JSON object when provided.')
  }
  if (configPath !== undefined && (typeof configPath !== 'string' || configPath.trim().length === 0)) {
    throw new Error('MCP configPath must be a non-empty string when provided.')
  }

  const parsed: McpToolCallInput = {
    server,
    tool,
  }

  return {
    ...parsed,
    ...(args === undefined ? {} : { arguments: args }),
    ...(configPath === undefined ? {} : { configPath }),
  }
}

export const mcpExternalCallTool: RuntimeToolDefinition = {
  name: 'mcp_external_call',
  description:
    'Execute a configured local stdio MCP tool through CodeMind runtime policy, redaction, and audit rendering.',
  capability: 'MCP_EXTERNAL_TOOL',
  execute: async (input: unknown, context: RuntimeToolContext): Promise<string> => {
    const request = parseMcpToolCallInput(input)
    return renderMcpToolExecution({ cwd: context.cwd, policy: context.policy, request })
  },
}
