import type { RuntimeToolDefinition, RuntimePolicySnapshot, CodemindRuntimeMode } from '../runtime/types.js'
import type { ProviderToolDefinition } from '../provider/provider.types.js'

export interface ToolInputSchema {
  readonly type: 'object'
  readonly properties: Record<string, unknown>
  readonly required?: readonly string[]
}

export interface BridgedToolDefinition {
  readonly providerTool: ProviderToolDefinition
  readonly runtimeTool: RuntimeToolDefinition
}

const READ_CAPABILITIES = new Set([
  'PLAN',
  'READ',
  'SEARCH',
  'REVIEW',
  'EVIDENCE_READ',
  'POLICY_CHECK',
  'LIVE_READ_CLIENT',
  'OPERATOR_REVIEW',
  'ZFLOW_REPORT',
  'ZFLOW_REPORT_CATALOG',
])

function isToolAllowedByMode(
  mode: CodemindRuntimeMode,
  tool: RuntimeToolDefinition,
): boolean {
  switch (mode) {
    case 'PLAN_ONLY':
      return tool.capability === 'PLAN' || tool.capability === 'READ'
    case 'READ_ONLY':
      return READ_CAPABILITIES.has(tool.capability)
    case 'PROPOSAL_ONLY':
      return READ_CAPABILITIES.has(tool.capability) || tool.capability === 'PROPOSE' || tool.capability === 'DRAFT_NOTES' || tool.capability === 'VALIDATE'
    case 'APPROVED_EXECUTION':
      return true
  }
}

export function buildToolInputSchema(tool: RuntimeToolDefinition): ToolInputSchema {
  const schemaMap: Partial<Record<string, ToolInputSchema>> = {
    plan_goal: {
      type: 'object',
      properties: { goal: { type: 'string', description: 'The goal to plan for' } },
      required: ['goal'],
    },
    list_files: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list' },
        recursive: { type: 'boolean', description: 'Whether to list recursively' },
      },
      required: ['path'],
    },
    read_file: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
        startLine: { type: 'number', description: 'Line to start reading from' },
        endLine: { type: 'number', description: 'Line to stop reading at' },
      },
      required: ['path'],
    },
    search_files: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex supported)' },
        path: { type: 'string', description: 'Directory to search in' },
        filePattern: { type: 'string', description: 'Glob pattern for file names' },
      },
      required: ['pattern'],
    },
    propose_edit: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        oldText: { type: 'string', description: 'Text to find and replace' },
        newText: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'oldText', 'newText'],
    },
    validation_plan: {
      type: 'object',
      properties: {
        focus: { type: 'string', description: 'Validation focus area' },
      },
      required: ['focus'],
    },
  }

  return schemaMap[tool.name] ?? {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input for the tool' },
    },
  }
}

export function bridgeToolsForProvider(
  tools: readonly RuntimeToolDefinition[],
  policy: RuntimePolicySnapshot,
): readonly BridgedToolDefinition[] {
  return tools
    .filter((tool) => isToolAllowedByMode(policy.mode, tool))
    .map((tool) => ({
      providerTool: {
        name: tool.name,
        description: tool.description,
        inputSchema: buildToolInputSchema(tool) as unknown as Record<string, unknown>,
      },
      runtimeTool: tool,
    }))
}

export function extractProviderTools(
  bridgedTools: readonly BridgedToolDefinition[],
): readonly ProviderToolDefinition[] {
  return bridgedTools.map((bt) => bt.providerTool)
}
