import type { RuntimePolicySnapshot, RuntimeToolDefinition } from '../types.js'
import {
  getCompletedRuntimeBuildPhaseCount,
  getNextRuntimeBuildPhase,
  RUNTIME_BUILD_PHASES,
} from '../runtime-build-state.js'

export interface RuntimeStatusSnapshot {
  readonly completedPhases: number
  readonly nextPhase: string
  readonly totalTools: number
  readonly toolNames: readonly string[]
  readonly capabilities: readonly string[]
  readonly policy: RuntimePolicySnapshot
  readonly workflowSupport: boolean
  readonly ajnaWorkflowSupport: boolean
}

export function buildRuntimeStatusSnapshot(
  tools: readonly RuntimeToolDefinition[],
  policy: RuntimePolicySnapshot,
): RuntimeStatusSnapshot {
  const completedPhases = getCompletedRuntimeBuildPhaseCount()
  const nextPhase = getNextRuntimeBuildPhase()
  const toolNames = tools.map((t) => t.name)
  const capabilities = [...new Set(tools.map((t) => t.capability))].sort()

  return {
    completedPhases,
    nextPhase: nextPhase !== undefined ? `Phase ${nextPhase.id} — ${nextPhase.title}` : 'none',
    totalTools: tools.length,
    toolNames,
    capabilities,
    policy,
    workflowSupport: true,
    ajnaWorkflowSupport: true,
  }
}

export function renderRuntimeStatusDashboard(snapshot: RuntimeStatusSnapshot): string {
  const lines = [
    'SymbolWright runtime status dashboard',
    '',
    `Completed phases:     ${snapshot.completedPhases}`,
    `Next phase:           ${snapshot.nextPhase}`,
    `Registered tools:     ${snapshot.totalTools}`,
    `Capabilities:         ${snapshot.capabilities.join(', ')}`,
    `Workflow support:     ${snapshot.workflowSupport ? 'YES' : 'NO'}`,
    `Ajna workflow:        ${snapshot.ajnaWorkflowSupport ? 'YES' : 'NO'}`,
    '',
    'Policy:',
    `  mode:               ${snapshot.policy.mode}`,
    `  allowNetwork:       ${snapshot.policy.allowNetwork}`,
    `  allowReadOnlyNetwork: ${snapshot.policy.allowReadOnlyNetwork}`,
    `  allowShell:         ${snapshot.policy.allowShell}`,
    `  allowWrites:        ${snapshot.policy.allowWrites}`,
    `  allowGitHubWrites:  ${snapshot.policy.allowGitHubWrites}`,
    `  protectedPaths:     ${snapshot.policy.protectedPaths.length}`,
    '',
    'Tools:',
    ...snapshot.toolNames.map((name) => `  - ${name}`),
    '',
    'Phase summary:',
    ...RUNTIME_BUILD_PHASES.map((phase) => `  Phase ${phase.id}: ${phase.title} [${phase.state}]`),
    '',
    'Boundary:',
    '- read-only status only',
    '- no new mutation surface',
  ]

  return lines.join('\n')
}
