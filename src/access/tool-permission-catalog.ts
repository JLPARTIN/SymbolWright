import type { SymbolWrightToolName } from '../runtime/types.js'
import type { ApprovalRequirement, RiskLevel } from './access-types.js'
import {
  SANDBOX_EGRESS_CAPABILITY,
  SANDBOX_OFFLINE_EXECUTE_CAPABILITY,
} from './sandbox-capabilities.js'

/**
 * Every SymbolWright tool must declare the capability (or capabilities) it
 * requires before it can be exposed to, or invoked by, an externally
 * authorized agent. A tool without an entry here is refused for any
 * agent-token-authenticated caller (fail closed) — see
 * `resolveToolPermissionDescriptor`.
 */
export interface ToolPermissionDescriptor {
  readonly capability: string
  readonly additionalCapabilities?: readonly string[]
  readonly riskLevel: RiskLevel
  readonly approvalOverride?: ApprovalRequirement
}

function tool(
  capability: string,
  riskLevel: RiskLevel,
  additionalCapabilities?: readonly string[],
): ToolPermissionDescriptor {
  return additionalCapabilities === undefined
    ? { capability, riskLevel }
    : { capability, riskLevel, additionalCapabilities }
}

export const TOOL_PERMISSION_DESCRIPTORS: Readonly<
  Record<SymbolWrightToolName, ToolPermissionDescriptor>
> = {
  plan_goal: tool('symbolwright.plan.create', 'low'),
  list_files: tool('repo.metadata.read', 'read'),
  read_file: tool('repo.content.read', 'read'),
  search_files: tool('symbolwright.repository.search', 'low'),
  propose_edit: tool('symbolwright.plan.create', 'low'),
  validation_plan: tool('symbolwright.plan.create', 'low'),
  ci_review: tool('repo.checks.read', 'read'),
  pr_notes: tool('symbolwright.plan.create', 'low'),
  github_pr_fixture_review: tool('repo.pull_requests.read', 'read'),
  github_ci_fixture_review: tool('repo.checks.read', 'read'),
  live_read_policy_handshake: tool('repo.metadata.read', 'read'),
  live_read_client_fixture: tool('repo.metadata.read', 'read'),
  github_live_read_pr: tool('repo.pull_requests.read', 'read'),
  github_live_read_ci: tool('repo.checks.read', 'read'),
  ajna_live_read_review: tool('repo.pull_requests.read', 'read'),
  ajna_live_read_merge_readiness: tool('repo.checks.read', 'read'),
  operator_review_packet: tool('symbolwright.plan.create', 'low'),
  write_intent_plan: tool('symbolwright.plan.create', 'low'),
  local_file_write: tool('repo.content.update', 'write', ['symbolwright.mission.execute']),
  apply_patch: tool('repo.content.update', 'write', ['symbolwright.mission.execute']),
  validation_command_gate: tool('symbolwright.validation.run', 'low'),
  pr_preparation: tool('symbolwright.plan.create', 'low'),
  github_write_proposal: tool('repo.pull_request.create', 'write'),
  github_write_gate: tool('repo.commit.push', 'write'),
  github_create_pr: tool('repo.pull_request.create', 'write'),
  pr_collaboration: tool('repo.review.respond', 'write'),
  zflow_report: tool('symbolwright.mission.read', 'read'),
  zflow_report_rollup: tool('symbolwright.mission.read', 'read'),
  zflow_report_catalog: tool('symbolwright.mission.read', 'read'),
  glob: tool('repo.content.read', 'read'),
  grep: tool('symbolwright.repository.search', 'low'),
  bash: tool(SANDBOX_OFFLINE_EXECUTE_CAPABILITY, 'write'),
  edit_file: tool('repo.content.update', 'write', ['symbolwright.mission.execute']),
  git: tool('repo.commit.create', 'write'),
  swarm_dispatch: tool('symbolwright.mission.execute', 'write'),
  run_tests: tool('symbolwright.validation.run', 'low', [SANDBOX_OFFLINE_EXECUTE_CAPABILITY]),
  run_typecheck: tool('symbolwright.validation.run', 'low'),
  run_lint: tool('symbolwright.validation.run', 'low'),
  memory_recall: tool('symbolwright.repository.search', 'low'),
  memory_store: tool('symbolwright.mission.execute', 'low'),
  preflight: tool('symbolwright.validation.run', 'low'),
  mcp_call: tool('symbolwright.mission.execute', 'write'),
  web_fetch: tool(SANDBOX_EGRESS_CAPABILITY, 'write'),
  web_search: tool(SANDBOX_EGRESS_CAPABILITY, 'write'),
  subagent_run: tool('symbolwright.mission.execute', 'write'),
  skill_run: tool('symbolwright.mission.execute', 'write'),
  sandbox_list_runtimes: tool(SANDBOX_OFFLINE_EXECUTE_CAPABILITY, 'read'),
  sandbox_execute: tool(SANDBOX_OFFLINE_EXECUTE_CAPABILITY, 'low'),
}

export function resolveToolPermissionDescriptor(
  toolName: string,
): ToolPermissionDescriptor | undefined {
  return Object.prototype.hasOwnProperty.call(TOOL_PERMISSION_DESCRIPTORS, toolName)
    ? TOOL_PERMISSION_DESCRIPTORS[toolName as SymbolWrightToolName]
    : undefined
}

/**
 * Capabilities that depend on the structured operation inside a tool request. These are additive
 * to the tool's baseline capability so an agent cannot use a broad tool surface to bypass a more
 * specific write authority.
 */
export function operationCapabilitiesForTool(
  toolName: string,
  metadata: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  if (toolName !== 'git') return []
  switch (metadata?.['operation']) {
    case 'checkout_new':
      return ['repo.branch.create']
    case 'add':
      return ['repo.content.update']
    case 'push':
      return ['repo.commit.push']
    default:
      return []
  }
}

/** Every baseline capability referenced by a tool. */
export function requiredCapabilitiesForTool(toolName: string): readonly string[] {
  const descriptor = resolveToolPermissionDescriptor(toolName)
  if (descriptor === undefined) return []
  return [descriptor.capability, ...(descriptor.additionalCapabilities ?? [])]
}
