import type { RuntimeToolDefinition } from '../types.js'

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
import { applyEditGatedTool } from './apply-edit-gated-tool.js'
import { commandDryRunGatedTool } from './command-dry-run-gated-tool.js'
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
  applyEditGatedTool,
  commandDryRunGatedTool,
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
]

export function assembleAgentTools(): readonly RuntimeToolDefinition[] {
  return ALL_TOOLS
}

export function assembleAgentToolsByCapability(
  capabilities: readonly string[],
): readonly RuntimeToolDefinition[] {
  const allowed = new Set(capabilities)
  return ALL_TOOLS.filter((tool) => allowed.has(tool.capability))
}

export function getToolByName(name: string): RuntimeToolDefinition | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name)
}
