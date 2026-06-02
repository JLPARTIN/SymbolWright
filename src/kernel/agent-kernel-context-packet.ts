import type { AgentKernelPlanningDecision, AgentKernelRole } from './agent-kernel.types.js'
import type { AgentKernelWorkflowValidationReport } from './agent-kernel-workflow-validator.js'
import type { AgentKernelSkillValidationReport } from './agent-kernel-skill-validator.js'

export const AGENT_KERNEL_CONTEXT_PACKET_BLOCK_ID = 'AGENT-KERNEL-04' as const
export const AGENT_KERNEL_CONTEXT_PACKET_PR_ID = 'PR-AK-04' as const
export const AGENT_KERNEL_CONTEXT_PACKET_PHASE_ID = 'Phase-16G-AK-04' as const

export const AGENT_KERNEL_CONTEXT_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
export type AgentKernelContextPriority = (typeof AGENT_KERNEL_CONTEXT_PRIORITIES)[number]

export const AGENT_KERNEL_CONTEXT_PACKET_SECTIONS = [
  'operator-intent',
  'repo-reference',
  'roles',
  'skills',
  'workflow-validation',
  'skill-validation',
  'source-lineage',
  'doctrine-notes',
] as const
export type AgentKernelContextPacketSection = (typeof AGENT_KERNEL_CONTEXT_PACKET_SECTIONS)[number]

export interface AgentKernelRepoContextReference {
  readonly repository: string
  readonly ref?: string
  readonly pullRequestNumber?: number
  readonly commitSha?: string
  readonly summary?: string
}

export interface AgentKernelContextPacketBuilderInput {
  readonly packetId: string
  readonly planningDecision: AgentKernelPlanningDecision
  readonly workflowValidation: AgentKernelWorkflowValidationReport
  readonly skillValidations: readonly AgentKernelSkillValidationReport[]
  readonly repoContext?: AgentKernelRepoContextReference
  readonly maxSections: number
  readonly maxSourceLineageItems: number
}

export interface AgentKernelContextPacketItem {
  readonly section: AgentKernelContextPacketSection
  readonly priority: AgentKernelContextPriority
  readonly title: string
  readonly content: string
}

export interface AgentKernelContextPacketBoundary {
  readonly maxSections: number
  readonly maxSourceLineageItems: number
  readonly emittedSections: number
  readonly truncated: boolean
  readonly omittedSections: readonly AgentKernelContextPacketSection[]
}

export interface AgentKernelContextPacket {
  readonly packetId: string
  readonly blockId: typeof AGENT_KERNEL_CONTEXT_PACKET_BLOCK_ID
  readonly prId: typeof AGENT_KERNEL_CONTEXT_PACKET_PR_ID
  readonly phaseId: typeof AGENT_KERNEL_CONTEXT_PACKET_PHASE_ID
  readonly sourcePlanningRequestId: string
  readonly providerReady: boolean
  readonly providerInvoked: false
  readonly repoContext?: AgentKernelRepoContextReference
  readonly items: readonly AgentKernelContextPacketItem[]
  readonly boundary: AgentKernelContextPacketBoundary
  readonly warnings: readonly string[]
}

function roleSummary(roles: readonly AgentKernelRole[]): string {
  return roles.length === 0 ? 'No roles selected.' : roles.join(', ')
}

function pushIfAllowed(
  items: AgentKernelContextPacketItem[],
  omittedSections: AgentKernelContextPacketSection[],
  maxSections: number,
  item: AgentKernelContextPacketItem,
): void {
  if (items.length < maxSections) {
    items.push(item)
    return
  }

  omittedSections.push(item.section)
}

function withOptionalRepoContext(
  packet: AgentKernelContextPacket,
  repoContext?: AgentKernelRepoContextReference,
): AgentKernelContextPacket {
  if (!repoContext) {
    return packet
  }

  return {
    ...packet,
    repoContext,
  }
}

export function buildAgentKernelContextPacket(
  input: AgentKernelContextPacketBuilderInput,
): AgentKernelContextPacket {
  const items: AgentKernelContextPacketItem[] = []
  const omittedSections: AgentKernelContextPacketSection[] = []
  const warnings: string[] = []
  const maxSections = Math.max(1, input.maxSections)
  const maxSourceLineageItems = Math.max(0, input.maxSourceLineageItems)
  const planning = input.planningDecision
  const workflow = input.workflowValidation
  const blockingSkillReports = input.skillValidations.filter((report) => !report.valid)

  if (!planning.accepted) {
    warnings.push('Planning decision is not accepted; packet is context-only.')
  }

  if (!workflow.valid) {
    warnings.push('Workflow validation is not valid; packet is context-only.')
  }

  if (blockingSkillReports.length > 0) {
    warnings.push('One or more skill validations are not valid; packet is context-only.')
  }

  pushIfAllowed(items, omittedSections, maxSections, {
    section: 'operator-intent',
    priority: 'CRITICAL',
    title: 'Operator Intent',
    content:
      planning.doctrineNotes.length > 0
        ? (planning.doctrineNotes[0] ?? 'No operator intent summary available.')
        : 'No operator intent summary available.',
  })

  if (input.repoContext) {
    pushIfAllowed(items, omittedSections, maxSections, {
      section: 'repo-reference',
      priority: 'HIGH',
      title: 'Repository Context Reference',
      content: [
        `repository=${input.repoContext.repository}`,
        input.repoContext.ref ? `ref=${input.repoContext.ref}` : undefined,
        input.repoContext.pullRequestNumber !== undefined
          ? `pr=${input.repoContext.pullRequestNumber}`
          : undefined,
        input.repoContext.commitSha ? `commit=${input.repoContext.commitSha}` : undefined,
        input.repoContext.summary,
      ]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join('\n'),
    })
  }

  pushIfAllowed(items, omittedSections, maxSections, {
    section: 'roles',
    priority: 'HIGH',
    title: 'Selected Roles',
    content: roleSummary(planning.roleProfiles.map((profile) => profile.role)),
  })

  pushIfAllowed(items, omittedSections, maxSections, {
    section: 'skills',
    priority: 'HIGH',
    title: 'Selected Skills',
    content:
      planning.selectedSkills.length === 0
        ? 'No skills selected.'
        : planning.selectedSkills.map((skill) => skill.skillId).join(', '),
  })

  pushIfAllowed(items, omittedSections, maxSections, {
    section: 'workflow-validation',
    priority: workflow.valid ? 'MEDIUM' : 'CRITICAL',
    title: 'Workflow Validation Summary',
    content: `valid=${workflow.valid}; findings=${workflow.findings.length}; mutationBlocked=${workflow.mutationBlocked}`,
  })

  pushIfAllowed(items, omittedSections, maxSections, {
    section: 'skill-validation',
    priority: blockingSkillReports.length === 0 ? 'MEDIUM' : 'CRITICAL',
    title: 'Skill Validation Summary',
    content: `reports=${input.skillValidations.length}; invalid=${blockingSkillReports.length}`,
  })

  const lineage = planning.sourceLineage.slice(0, maxSourceLineageItems)
  pushIfAllowed(items, omittedSections, maxSections, {
    section: 'source-lineage',
    priority: 'MEDIUM',
    title: 'Source Lineage',
    content: lineage.length === 0 ? 'No source lineage emitted.' : lineage.join('\n'),
  })

  pushIfAllowed(items, omittedSections, maxSections, {
    section: 'doctrine-notes',
    priority: 'LOW',
    title: 'Doctrine Notes',
    content:
      planning.doctrineNotes.length === 0
        ? 'No doctrine notes emitted.'
        : planning.doctrineNotes.join('\n'),
  })

  const providerReady = planning.accepted && workflow.valid && blockingSkillReports.length === 0
  const packet: AgentKernelContextPacket = {
    packetId: input.packetId,
    blockId: AGENT_KERNEL_CONTEXT_PACKET_BLOCK_ID,
    prId: AGENT_KERNEL_CONTEXT_PACKET_PR_ID,
    phaseId: AGENT_KERNEL_CONTEXT_PACKET_PHASE_ID,
    sourcePlanningRequestId: planning.requestId,
    providerReady,
    providerInvoked: false,
    items,
    boundary: {
      maxSections,
      maxSourceLineageItems,
      emittedSections: items.length,
      truncated: omittedSections.length > 0,
      omittedSections,
    },
    warnings,
  }

  return withOptionalRepoContext(packet, input.repoContext)
}
