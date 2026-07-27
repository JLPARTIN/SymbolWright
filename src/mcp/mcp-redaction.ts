import { redactValidationOutput } from '../runtime/validation/validation-output-redactor.js'
import type { McpToolCallResult, McpToolContentBlock } from './mcp-client.js'

/** Redacts secrets/paths from raw text (stderr logs, transcripts) before it's logged. */
export function redactMcpText(text: string): string {
  return redactValidationOutput(text)
}

/** Redacts every text content block in a tool-call result before it reaches audit/log output. */
export function redactMcpToolResult(result: McpToolCallResult): McpToolCallResult {
  return {
    ...result,
    content: result.content.map((block): McpToolContentBlock =>
      block.text !== undefined ? { ...block, text: redactMcpText(block.text) } : block,
    ),
  }
}
