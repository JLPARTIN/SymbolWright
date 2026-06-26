import type { TuiState } from './tui.types.js'

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
