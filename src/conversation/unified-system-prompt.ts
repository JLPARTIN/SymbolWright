import type { SystemPromptContext } from './system-prompt-builder.js'
import { buildSystemPrompt } from './system-prompt-builder.js'
import type { SwarmAgentType } from '../hivemind/hivemind.types.js'
import type { TuiAjnaStatus } from '../tui/tui.types.js'

export interface UnifiedPromptContext extends SystemPromptContext {
  readonly swarmAgentTypes?: readonly SwarmAgentType[]
  readonly swarmDescriptions?: Readonly<Record<string, string>>
  readonly ajnaStatus?: TuiAjnaStatus
  readonly sessionId?: string
  readonly conversationSummary?: string
  readonly permissionMode?: string
}

export function buildUnifiedSystemPrompt(context: UnifiedPromptContext = {}): string {
  const base = buildSystemPrompt(context)
  const sections: string[] = [base]

  sections.push(buildIdentitySection(context.permissionMode))
  sections.push(buildDoctrineSection(context.permissionMode))

  if (context.swarmAgentTypes !== undefined && context.swarmAgentTypes.length > 0) {
    sections.push(buildSwarmSection(context.swarmAgentTypes, context.swarmDescriptions))
  }

  if (context.ajnaStatus !== undefined && context.ajnaStatus.active) {
    sections.push(buildAjnaSection(context.ajnaStatus))
  }

  if (context.permissionMode !== undefined) {
    sections.push(buildPermissionSection(context.permissionMode))
  }

  if (context.conversationSummary !== undefined) {
    sections.push(buildConversationSection(context.conversationSummary))
  }

  return sections.join('\n\n')
}

function buildIdentitySection(mode?: string): string {
  const activeMode = mode ?? 'APPROVED_EXECUTION'
  return [
    '## Identity',
    'You are SymbolWright — an autonomous coding agent operating within the AELIB-X1YA0I ecosystem.',
    'You orchestrate specialized swarm agents via HiveMind and use the Ajna Review Cortex for quality and forensic assessment when requested or when the active workflow requires it.',
    `Current runtime mode: ${activeMode}. Tool access follows this active mode instead of a permanent approval-gate personality.`,
  ].join('\n')
}

function buildDoctrineSection(mode?: string): string {
  if (mode === 'PLAN_ONLY') {
    return [
      '## Doctrine',
      '- Produce plans only. Do not call mutation tools.',
      '- Use governance and Ajna analysis as advisory evidence only.',
      '- Call out the exact mode boundary when implementation is requested.',
    ].join('\n')
  }

  if (mode === 'READ_ONLY') {
    return [
      '## Doctrine',
      '- Read, inspect, search, and analyze repository state without mutating files or services.',
      '- Do not run shell, git write, local write, or GitHub write tools.',
      '- Use governance and Ajna analysis as forensic evidence when helpful.',
    ].join('\n')
  }

  if (mode === 'PROPOSAL_ONLY') {
    return [
      '## Doctrine',
      '- Draft patches, plans, validation guidance, and PR notes without applying changes.',
      '- Do not execute local writes, shell commands, git write operations, or GitHub writes.',
      '- Preserve enough detail that an operator or direct mode can apply the proposal cleanly.',
    ].join('\n')
  }

  return [
    '## Doctrine',
    '- You are in APPROVED_EXECUTION mode: perform direct implementation work when the user has clearly requested it.',
    '- Direct file edits, patch application, validation commands, shell commands, git operations, and GitHub write tools are allowed when exposed by the active runtime policy.',
    '- Governance, audit, and Ajna review are available forensic capabilities; use them when requested, when reviewing risk, or when preparing release/merge evidence.',
    '- Do not expose secrets, escape the workspace, force-push, or push directly to main/master/production/release.',
    '- Prefer useful completed work over approval theater or plan-only behavior.',
    '- Roll back or clearly report changes when test-fix loops exhaust retries.',
  ].join('\n')
}

function buildSwarmSection(
  agentTypes: readonly SwarmAgentType[],
  descriptions?: Readonly<Record<string, string>>,
): string {
  const defaultDescriptions: Record<string, string> = {
    investigator:
      'Read-only exploration of codebases — file search, pattern matching, structure analysis.',
    coder:
      'Code implementation — reads context and writes fixes or features when runtime mode permits.',
    analyzer:
      'Validation — runs tests, typecheck, lint, and reports results when runtime mode permits.',
    reviewer: 'Quality assessment — triggers Ajna review pipeline for risk and merge readiness.',
    reporter: 'Summarization — tracks lineage, summarizes findings, reports status.',
  }

  const lines = ['## HiveMind Swarm Agents', 'Available agent types for dispatch:']
  for (const agentType of agentTypes) {
    const desc = descriptions?.[agentType] ?? defaultDescriptions[agentType] ?? 'Specialized agent.'
    lines.push(`- ${agentType}: ${desc}`)
  }
  return lines.join('\n')
}

function buildAjnaSection(ajna: TuiAjnaStatus): string {
  const lines = ['## Ajna Review Intelligence (Active)']
  if (ajna.riskLevel !== undefined) {
    lines.push(`Current risk level: ${ajna.riskLevel}`)
  }
  if (ajna.mergeDecision !== undefined) {
    lines.push(`Merge decision: ${ajna.mergeDecision}`)
  }
  if (ajna.findings.length > 0) {
    lines.push('Active findings:')
    for (const finding of ajna.findings) {
      lines.push(`- ${finding}`)
    }
  }
  if (ajna.lastReviewedAt !== undefined) {
    lines.push(`Last reviewed: ${ajna.lastReviewedAt}`)
  }
  return lines.join('\n')
}

function buildPermissionSection(mode: string): string {
  return [
    '## Runtime Mode',
    `Current mode: ${mode}`,
    'Tool availability and mutation behavior are evaluated against the active runtime policy for this mode.',
  ].join('\n')
}

function buildConversationSection(summary: string): string {
  return ['## Conversation Context', summary].join('\n')
}
