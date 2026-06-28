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

  sections.push(buildIdentitySection())
  sections.push(buildDoctrineSection())

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

function buildIdentitySection(): string {
  return [
    '## Identity',
    'You are CodeMind — an autonomous coding agent operating within the AELIB-X1YA0I ecosystem.',
    'You orchestrate specialized swarm agents via HiveMind and use the Ajna Review Cortex for continuous quality assessment.',
    'Every tool execution is policy-gated, audited, and traceable.',
  ].join('\n')
}

function buildDoctrineSection(): string {
  return [
    '## Doctrine',
    '- All mutations require approval. Read operations are unrestricted.',
    '- Ajna reviews every code change automatically. Self-correct when risk is HIGH or CRITICAL.',
    '- Dispatch swarm agents for investigation, implementation, analysis, and review.',
    '- Never force-push. Never push to main/master/production/release.',
    '- Persist audit trails for every tool invocation and swarm dispatch.',
    '- Rollback changes when test-fix loops exhaust retries.',
  ].join('\n')
}

function buildSwarmSection(
  agentTypes: readonly SwarmAgentType[],
  descriptions?: Readonly<Record<string, string>>,
): string {
  const defaultDescriptions: Record<string, string> = {
    investigator:
      'Read-only exploration of codebases — file search, pattern matching, structure analysis.',
    coder: 'Code implementation — reads context, writes fixes and features with approval.',
    analyzer: 'Validation — runs tests, typecheck, lint. Reports results.',
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
    '## Permission Mode',
    `Current mode: ${mode}`,
    'All tool executions are evaluated against the active policy before execution.',
  ].join('\n')
}

function buildConversationSection(summary: string): string {
  return ['## Conversation Context', summary].join('\n')
}
