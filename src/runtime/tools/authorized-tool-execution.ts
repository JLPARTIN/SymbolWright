import {
  operationCapabilitiesForTool,
  resolveToolPermissionDescriptor,
} from '../../access/tool-permission-catalog.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

/**
 * The single chokepoint every production tool-execution path (`agent-loop.ts`'s LLM-driven tool
 * calls, and the MCP server's `call()`) must route through. When `context.accessControl` is
 * present (an agent-token-authenticated caller), this performs a real per-operation authorization
 * check before the tool runs — fail closed on any tool without a permission descriptor. When
 * `context.accessControl` is absent (the legacy local operator, authenticated via
 * `SYMBOLWRIGHT_API_KEY`), the tool runs unrestricted, matching today's behavior exactly.
 */
export async function runAuthorizedTool<TInput>(
  tool: RuntimeToolDefinition<TInput>,
  input: TInput,
  context: RuntimeToolContext,
): Promise<string> {
  const accessControl = context.accessControl
  if (accessControl !== undefined) {
    const descriptor = resolveToolPermissionDescriptor(tool.name)
    if (descriptor === undefined) {
      throw new Error(
        `authorization_denied[UNKNOWN_TOOL]: Tool "${tool.name}" has no registered permission descriptor and is refused for an authorized agent.`,
      )
    }
    const metadata =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : undefined
    const capabilities = [
      descriptor.capability,
      ...(descriptor.additionalCapabilities ?? []),
      ...operationCapabilitiesForTool(tool.name, metadata),
    ]
    for (const capability of [...new Set(capabilities)]) {
      await accessControl.requireAuthorized(capability, tool.name, metadata)
    }
  }
  return tool.execute(input, context)
}
