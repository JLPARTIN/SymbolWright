import type {
  MultiAgentMissionState,
  SpecialistAgentRole,
  SpecialistAgentStatus,
} from './multi-agent-mission-runtime.js'

export interface MultiAgentDashboardAgent {
  readonly agentId: string
  readonly role: SpecialistAgentRole
  readonly taskId: string
  readonly status: SpecialistAgentStatus
  readonly evidenceCount: number
  readonly diagnostics: readonly string[]
  readonly modifiedFiles: readonly string[]
}

export interface MultiAgentDashboardProjection {
  readonly missionId: string
  readonly objective: string
  readonly statusCounts: Readonly<Record<SpecialistAgentStatus, number>>
  readonly activeAgents: readonly MultiAgentDashboardAgent[]
  readonly agents: readonly MultiAgentDashboardAgent[]
  readonly evidenceCount: number
  readonly modifiedFiles: readonly string[]
  readonly updatedAt: string
}

export function projectMultiAgentDashboard(
  state: MultiAgentMissionState,
): MultiAgentDashboardProjection {
  const agents = state.assignments.map((assignment) => ({
    agentId: assignment.agentId,
    role: assignment.role,
    taskId: assignment.taskId,
    status: assignment.status,
    evidenceCount: assignment.evidence.length,
    diagnostics: assignment.diagnostics,
    modifiedFiles: assignment.modifiedFiles,
  }))
  const statusCounts = createStatusCounts()
  for (const agent of agents) statusCounts[agent.status] += 1

  return {
    missionId: state.missionId,
    objective: state.objective,
    statusCounts,
    activeAgents: agents.filter((agent) => agent.status === 'running' || agent.status === 'waiting'),
    agents,
    evidenceCount: agents.reduce((total, agent) => total + agent.evidenceCount, 0),
    modifiedFiles: [...new Set(agents.flatMap((agent) => agent.modifiedFiles))].sort(),
    updatedAt: state.updatedAt,
  }
}

function createStatusCounts(): Record<SpecialistAgentStatus, number> {
  return {
    idle: 0,
    running: 0,
    waiting: 0,
    failed: 0,
    completed: 0,
  }
}
