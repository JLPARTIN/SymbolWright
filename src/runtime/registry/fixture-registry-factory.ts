import { createRuntimeRegistry, type RuntimeRegistry } from './runtime-registry.js'
import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'
import type { RuntimeToolContext, RuntimeToolDefinition } from '../types.js'

import { planGoalTool } from '../planner/goal-planner.js'
import { readFileTool } from '../tools/read-file-tool.js'
import { listFilesTool } from '../tools/list-files-tool.js'
import { searchFilesTool } from '../tools/search-files-tool.js'
import { validationPlanTool } from '../tools/validation-plan-tool.js'
import { proposeEditTool } from '../tools/propose-edit-tool.js'
import { prNotesTool } from '../tools/pr-notes-tool.js'
import { ciReviewTool } from '../tools/ci-review-tool.js'
import {
  githubPrFixtureReviewTool,
  githubCiFixtureReviewTool,
} from '../tools/github-fixture-tools.js'
import { liveReadPolicyHandshakeTool } from '../tools/live-read-policy-tool.js'
import { liveReadClientFixtureTool } from '../tools/live-read-client-fixture-tool.js'
import { operatorReviewPacketTool } from '../tools/operator-review-packet-tool.js'
import { writeIntentPlanTool } from '../tools/write-intent-plan-tool.js'
import { localFileWriteTool } from '../tools/local-file-write-tool.js'
import { validationCommandGateTool } from '../tools/validation-command-gate-tool.js'
import { prPreparationTool } from '../tools/pr-preparation-tool.js'
import { githubWriteProposalTool } from '../tools/github-write-proposal-tool.js'
import { githubWriteGateTool } from '../tools/github-write-gate-tool.js'
import { githubCreatePrTool } from '../tools/github-create-pr-tool.js'
import { prCollaborationTool } from '../tools/pr-collaboration-tool.js'
import { applyPatchTool } from '../tools/apply-patch-tool.js'
import { zflowReportTool } from '../tools/zflow-report-tool.js'
import { zflowReportCatalogTool } from '../tools/zflow-report-catalog-tool.js'
import { mcpExternalCallTool } from '../tools/mcp-external-call-tool.js'

import { GitHubLiveReadPolicyWrapper } from '../live-read/github-live-read-policy-wrapper.js'
import {
  FakeLiveReadClient,
  type FakeLiveReadClientData,
} from '../live-read/fake-live-read-client.js'
import { createGitHubLiveReadPrTool } from '../tools/github-live-read-pr-tool.js'
import { createGitHubLiveReadCiTool } from '../tools/github-live-read-ci-tool.js'
import { createAjnaLiveReadReviewTool } from '../tools/ajna-live-read-review-tool.js'
import { createAjnaLiveReadMergeReadinessTool } from '../tools/ajna-live-read-merge-readiness-tool.js'
import type { RuntimeLiveReadClient } from '../live-read/runtime-live-read-client.js'

export type FixtureRegistryPreset =
  | 'read_only'
  | 'proposal'
  | 'github_read'
  | 'live_read_policy'
  | 'live_read_client'
  | 'github_live_read'
  | 'ajna_live_read'
  | 'operator_review'
  | 'write_prep'
  | 'local_write'
  | 'validation_command'
  | 'pr_preparation'
  | 'github_write_proposal'
  | 'github_write_gate'
  | 'workflow'
  | 'github_pr_creation'
  | 'pr_collaboration'
  | 'patch_application'
  | 'local_self_edit'
  | 'zflow_report'
  | 'zflow_report_catalog'
  | 'mcp'

const READ_ONLY_TOOLS: readonly RuntimeToolDefinition[] = [
  planGoalTool,
  listFilesTool,
  readFileTool,
  searchFilesTool,
  validationPlanTool,
]

const PROPOSAL_TOOLS: readonly RuntimeToolDefinition[] = [
  proposeEditTool,
  prNotesTool,
  ciReviewTool,
]

const GITHUB_READ_TOOLS: readonly RuntimeToolDefinition[] = [
  githubPrFixtureReviewTool,
  githubCiFixtureReviewTool,
]

function buildLiveReadTools(
  clientData: FakeLiveReadClientData,
  realClient?: RuntimeLiveReadClient,
): readonly RuntimeToolDefinition[] {
  const inner = realClient ?? new FakeLiveReadClient(clientData)
  const client = new GitHubLiveReadPolicyWrapper(inner)
  return [createGitHubLiveReadPrTool(client), createGitHubLiveReadCiTool(client)]
}

function buildAjnaLiveReadTools(
  clientData: FakeLiveReadClientData,
): readonly RuntimeToolDefinition[] {
  const client = new GitHubLiveReadPolicyWrapper(new FakeLiveReadClient(clientData))
  return [createAjnaLiveReadReviewTool(client), createAjnaLiveReadMergeReadinessTool(client)]
}

function collectTools(
  preset: FixtureRegistryPreset,
  clientData: FakeLiveReadClientData,
  realClient?: RuntimeLiveReadClient,
): readonly RuntimeToolDefinition[] {
  const tools: RuntimeToolDefinition[] = []

  if (preset === 'zflow_report') return [zflowReportTool]
  if (preset === 'zflow_report_catalog') return [zflowReportCatalogTool]
  if (preset === 'mcp') return [mcpExternalCallTool]

  tools.push(...READ_ONLY_TOOLS)
  if (preset === 'read_only') return tools

  tools.push(...PROPOSAL_TOOLS)
  if (preset === 'proposal') return tools

  tools.push(...GITHUB_READ_TOOLS)
  if (preset === 'github_read') return tools

  tools.push(liveReadPolicyHandshakeTool)
  if (preset === 'live_read_policy') return tools

  tools.push(liveReadClientFixtureTool)
  if (preset === 'live_read_client') return tools

  tools.push(...buildLiveReadTools(clientData, realClient))
  if (preset === 'github_live_read') return tools

  tools.push(...buildAjnaLiveReadTools(clientData))
  if (preset === 'ajna_live_read') return tools

  tools.push(operatorReviewPacketTool)
  if (preset === 'operator_review') return tools

  tools.push(writeIntentPlanTool)
  if (preset === 'write_prep') return tools

  tools.push(localFileWriteTool)
  if (preset === 'local_write') return tools

  if (preset === 'patch_application') {
    tools.push(applyPatchTool)
    return tools
  }

  tools.push(validationCommandGateTool)
  if (preset === 'validation_command') return tools

  if (preset === 'local_self_edit') {
    tools.push(applyPatchTool)
    return tools
  }

  tools.push(prPreparationTool)
  if (preset === 'pr_preparation') return tools

  tools.push(githubWriteProposalTool)
  if (preset === 'github_write_proposal') return tools

  tools.push(githubWriteGateTool)
  if (preset === 'github_write_gate' || preset === 'workflow') return tools

  tools.push(githubCreatePrTool)
  if (preset === 'github_pr_creation') return tools

  tools.push(prCollaborationTool)
  return tools
}

export function createFixtureRegistry(
  preset: FixtureRegistryPreset,
  clientData: FakeLiveReadClientData = {},
  realClient?: RuntimeLiveReadClient,
): RuntimeRegistry {
  return createRuntimeRegistry(collectTools(preset, clientData, realClient))
}

export function createFixtureContext(cwd?: string): RuntimeToolContext {
  if (arguments.length === 0) {
    return {
      cwd: process.cwd(),
      policy: {
        mode: 'READ_ONLY',
        allowNetwork: false,
        allowShell: false,
        allowWrites: false,
        allowGitHubWrites: false,
        protectedPaths: ['.git', '.env', '.env.local', 'node_modules', 'dist', 'coverage'],
        noisyDirs: ['.git', 'node_modules', 'dist', 'coverage', '.next'],
      },
    }
  }

  return {
    cwd: cwd ?? process.cwd(),
    policy: createDefaultRuntimePolicy(),
  }
}
