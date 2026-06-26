import type { TuiState, TuiToolStatus } from './tui.types.js'

export interface TuiWorkspaceRenderOptions {
  readonly mission?: string
  readonly commandHistory?: readonly string[]
  readonly width?: number
}

export function renderTuiStatusBar(state: TuiState): string {
  const parts: string[] = []

  parts.push(`[${state.session.model}]`)
  parts.push(`tokens: ${state.session.tokenCount}`)

  if (state.session.costEstimate > 0) {
    parts.push(`cost: $${state.session.costEstimate.toFixed(4)}`)
  }

  if (state.streaming) {
    parts.push('streaming...')
  }

  if (state.activeTools.length > 0) {
    const running = state.activeTools.filter((t) => t.status === 'running')
    if (running.length > 0) {
      const toolNames = running.map((t) => t.toolName).join(', ')
      parts.push(`tools: ${toolNames}`)
    }
  }

  if (state.swarmAgents.length > 0) {
    const active = state.swarmAgents.filter((a) => a.status === 'active')
    if (active.length > 0) {
      parts.push(`swarm: ${active.length} active`)
    }
  }

  if (state.ajna.active && state.ajna.riskLevel !== undefined) {
    parts.push(`ajna: ${state.ajna.riskLevel}`)
  }

  if (state.approvalPending) {
    parts.push('[APPROVAL NEEDED]')
  }

  return parts.join(' | ')
}

export function renderTuiSwarmPanel(state: TuiState): string {
  if (state.swarmAgents.length === 0) {
    return 'HiveMind: No swarm agents active.'
  }

  const lines = ['HiveMind Swarm Status:', '']

  for (const agent of state.swarmAgents) {
    const statusIcon = agent.status === 'active' ? '>' : agent.status === 'completed' ? '+' : agent.status === 'failed' ? 'x' : '-'
    const taskInfo = agent.task !== undefined ? ` — ${agent.task}` : ''
    lines.push(`  [${statusIcon}] ${agent.agentType} (${agent.agentId}): ${agent.status}${taskInfo}`)
  }

  return lines.join('\n')
}

export function renderTuiAjnaPanel(state: TuiState): string {
  const { ajna } = state

  if (!ajna.active) {
    return 'Ajna: Inactive'
  }

  const lines = ['Ajna Review Intelligence:', '']

  if (ajna.riskLevel !== undefined) {
    lines.push(`  Risk Level: ${ajna.riskLevel}`)
  }
  if (ajna.mergeDecision !== undefined) {
    lines.push(`  Merge Decision: ${ajna.mergeDecision}`)
  }

  if (ajna.findings.length > 0) {
    lines.push('  Findings:')
    for (const finding of ajna.findings) {
      lines.push(`    - ${finding}`)
    }
  }

  if (ajna.lastReviewedAt !== undefined) {
    lines.push(`  Last reviewed: ${ajna.lastReviewedAt}`)
  }

  return lines.join('\n')
}

export function renderTuiToolPanel(state: TuiState): string {
  if (state.activeTools.length === 0) {
    return 'Tools: No active tools.'
  }

  const lines = ['Tool Console:', '']
  for (const tool of state.activeTools) {
    lines.push(renderToolStatus(tool))
  }
  return lines.join('\n')
}

export function renderTuiWorkspace(state: TuiState, options: TuiWorkspaceRenderOptions = {}): string {
  const divider = makeDivider(options.width ?? 72)
  const mission = normalizeMission(options.mission)
  const commandHistory = options.commandHistory ?? []
  const lines = [
    'CodeMind Workspace',
    divider,
    renderTuiStatusBar(state),
    divider,
    'Mission Console:',
    mission === undefined ? '  > Awaiting mission input...' : `  > ${mission}`,
    '',
    'Command History:',
    ...renderCommandHistory(commandHistory),
    divider,
    'Agent Stream:',
    state.streamBuffer.length > 0 ? state.streamBuffer : '  Ready. Start a mission to stream reasoning, tools, and results here.',
    divider,
    renderTuiToolPanel(state),
    divider,
    renderTuiSwarmPanel(state),
    divider,
    renderTuiAjnaPanel(state),
    divider,
    state.approvalPending ? `Approval: ${state.approvalPrompt ?? 'Operator approval required.'}` : 'Approval: none pending',
  ]

  return lines.join('\n')
}

export function renderTuiBatchOutput(state: TuiState): string {
  const lines: string[] = []

  if (state.streamBuffer.length > 0) {
    lines.push(state.streamBuffer)
  }

  if (state.ajna.active && state.ajna.riskLevel !== undefined) {
    lines.push('')
    lines.push(`[Ajna] Risk: ${state.ajna.riskLevel} | Merge: ${state.ajna.mergeDecision ?? 'N/A'}`)
  }

  if (state.swarmAgents.length > 0) {
    const completed = state.swarmAgents.filter((a) => a.status === 'completed')
    const failed = state.swarmAgents.filter((a) => a.status === 'failed')
    lines.push('')
    lines.push(`[Swarm] ${completed.length} completed, ${failed.length} failed`)
  }

  return lines.join('\n')
}

function renderToolStatus(tool: TuiToolStatus): string {
  const output = tool.output === undefined ? '' : ` — ${tool.output}`
  return `  [${tool.status}] ${tool.toolName} (${tool.elapsedMs}ms)${output}`
}

function renderCommandHistory(commandHistory: readonly string[]): string[] {
  if (commandHistory.length === 0) {
    return ['  No commands yet.']
  }

  return commandHistory.map((command, index) => `  ${index + 1}. ${command}`)
}

function normalizeMission(mission: string | undefined): string | undefined {
  const trimmed = mission?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

function makeDivider(width: number): string {
  const safeWidth = Math.max(24, Math.min(width, 120))
  return '-'.repeat(safeWidth)
}
