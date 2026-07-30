import type {
  SymbolWrightToolName,
  RuntimeToolCapability,
  RuntimeToolDefinition,
} from '../types.js'
import { ALL_SYMBOLWRIGHT_TOOL_NAMES } from '../types.js'

import { readFileTool } from './read-file-tool.js'
import { listFilesTool } from './list-files-tool.js'
import { searchFilesTool } from './search-files-tool.js'
import { editFileTool } from './edit-file-tool.js'
import { globTool } from './glob-tool.js'
import { grepTool } from './grep-tool.js'
import { bashTool } from './bash-tool.js'
import { gitExecuteTool } from './git-execute-tool.js'
import { localFileWriteTool } from './local-file-write-tool.js'
import { applyPatchTool } from './apply-patch-tool.js'
import { validationPlanTool } from './validation-plan-tool.js'
import { validationCommandGateTool } from './validation-command-gate-tool.js'
import { prPreparationTool } from './pr-preparation-tool.js'
import { prNotesTool } from './pr-notes-tool.js'
import { ciReviewTool } from './ci-review-tool.js'
import { operatorReviewPacketTool } from './operator-review-packet-tool.js'
import { writeIntentPlanTool } from './write-intent-plan-tool.js'
import { proposeEditTool } from './propose-edit-tool.js'
import { prCollaborationTool } from './pr-collaboration-tool.js'
import { githubCreatePrTool } from './github-create-pr-tool.js'
import { githubWriteGateTool } from './github-write-gate-tool.js'
import { githubWriteProposalTool } from './github-write-proposal-tool.js'
import { githubPrFixtureReviewTool, githubCiFixtureReviewTool } from './github-fixture-tools.js'
import { liveReadPolicyHandshakeTool } from './live-read-policy-tool.js'
import { liveReadClientFixtureTool } from './live-read-client-fixture-tool.js'
import { zflowReportTool } from './zflow-report-tool.js'
import { zflowReportRollupTool } from './zflow-report-rollup-tool.js'
import { zflowReportCatalogTool } from './zflow-report-catalog-tool.js'
import { swarmDispatchTool } from './swarm-dispatch-tool.js'
import { subagentRunTool } from './subagent-run-tool.js'
import { skillRunTool } from './skill-run-tool.js'
import { runTestsTool } from './run-tests-tool.js'
import { runTypecheckTool } from './run-typecheck-tool.js'
import { runLintTool } from './run-lint-tool.js'
import { memoryRecallTool } from './memory-recall-tool.js'
import { memoryStoreTool } from './memory-store-tool.js'
import { preflightTool } from './preflight-tool.js'
import { mcpCallTool } from './mcp-call-tool.js'
import { webFetchTool } from './web-fetch-tool.js'
import { webSearchTool } from './web-search-tool.js'
import { sandboxExecuteTool, sandboxListRuntimesTool } from './sandbox-tools.js'
import { dependencyAcquireTool } from './dependency-acquire-tool.js'

const ALL_TOOLS: readonly RuntimeToolDefinition[] = [
  readFileTool,
  listFilesTool,
  searchFilesTool,
  editFileTool,
  globTool,
  grepTool,
  bashTool,
  gitExecuteTool,
  localFileWriteTool,
  applyPatchTool,
  validationPlanTool,
  validationCommandGateTool,
  prPreparationTool,
  prNotesTool,
  ciReviewTool,
  operatorReviewPacketTool,
  writeIntentPlanTool,
  proposeEditTool,
  prCollaborationTool,
  githubCreatePrTool,
  githubWriteGateTool,
  githubWriteProposalTool,
  githubPrFixtureReviewTool,
  githubCiFixtureReviewTool,
  liveReadPolicyHandshakeTool,
  liveReadClientFixtureTool,
  zflowReportTool,
  zflowReportRollupTool,
  zflowReportCatalogTool,
  swarmDispatchTool,
  subagentRunTool,
  skillRunTool,
  runTestsTool,
  runTypecheckTool,
  runLintTool,
  memoryRecallTool,
  memoryStoreTool,
  preflightTool,
  mcpCallTool,
  webFetchTool,
  webSearchTool,
  sandboxListRuntimesTool,
  sandboxExecuteTool,
  dependencyAcquireTool,
]

export const DYNAMICALLY_WIRED_TOOLS: readonly SymbolWrightToolName[] = [
  'plan_goal',
  'github_live_read_pr',
  'github_live_read_ci',
  'ajna_live_read_review',
  'ajna_live_read_merge_readiness',
] as const

/** Returns all statically-wired runtime tools. */
export function assembleAgentTools(): readonly RuntimeToolDefinition[] {
  return ALL_TOOLS
}

/** Returns tools filtered to the given capability set. */
export function assembleAgentToolsByCapability(
  capabilities: readonly RuntimeToolCapability[],
): readonly RuntimeToolDefinition[] {
  const allowed = new Set<string>(capabilities)
  return ALL_TOOLS.filter((tool) => allowed.has(tool.capability))
}

/** Looks up a tool by name, returning undefined if not found. */
export function getToolByName(name: string): RuntimeToolDefinition | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name)
}

/** Throws if any tool name is duplicated or missing from the type union. */
export function assertToolAssemblyIntegrity(): void {
  const names = ALL_TOOLS.map((t) => t.name)
  const nameSet = new Set(names)

  if (nameSet.size !== names.length) {
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i)
    throw new Error(`Duplicate tool names in assembly: ${duplicates.join(', ')}`)
  }

  const dynamicSet = new Set<string>(DYNAMICALLY_WIRED_TOOLS)
  const allNamesSet = new Set<string>(ALL_SYMBOLWRIGHT_TOOL_NAMES)

  for (const name of ALL_SYMBOLWRIGHT_TOOL_NAMES) {
    if (!dynamicSet.has(name) && !nameSet.has(name)) {
      throw new Error(
        `SymbolWrightToolName "${name}" is missing from tool assembly (and is not dynamically wired)`,
      )
    }
  }

  for (const name of names) {
    if (!allNamesSet.has(name)) {
      throw new Error(`Tool "${name}" in assembly is not a valid SymbolWrightToolName`)
    }
  }
}
