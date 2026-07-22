import type { MissionDashboardProjection } from '../autonomy/mission-dashboard-projection.js'

export function renderMissionDashboardHtml(dashboard: MissionDashboardProjection): string {
  const actions = availableActions(dashboard.status)
  const taskRows = dashboard.tasks
    .map(
      (task) =>
        `<li data-task-state="${escapeHtml(task.state)}"><strong>${escapeHtml(task.objective)}</strong><span>${escapeHtml(task.state)} · attempt ${task.attempts}</span></li>`,
    )
    .join('')
  const files =
    dashboard.modifiedFiles.length === 0
      ? '<p class="mission-empty">No files modified yet.</p>'
      : `<ul>${dashboard.modifiedFiles.map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join('')}</ul>`
  const timeline = dashboard.timeline
    .map(
      (entry) =>
        `<li><time datetime="${escapeHtml(entry.timestamp)}">${escapeHtml(entry.timestamp)}</time>${escapeHtml(entry.label)}</li>`,
    )
    .join('')

  return `<section class="mission-dashboard" data-mission-id="${escapeHtml(dashboard.missionId)}" data-status="${escapeHtml(dashboard.status)}">
<header>
<div><p class="mission-kicker">Autonomous Mission</p><h2>${escapeHtml(dashboard.objective)}</h2></div>
<span class="mission-status">${escapeHtml(dashboard.status)}</span>
</header>
<div class="mission-actions">${actions
    .map(
      (action) =>
        `<button type="button" data-autonomy-action="${action}">${capitalize(action)}</button>`,
    )
    .join('')}</div>
<dl class="mission-metrics">
<div><dt>Completed</dt><dd>${dashboard.taskCounts.completed}</dd></div>
<div><dt>Running</dt><dd>${dashboard.taskCounts.running}</dd></div>
<div><dt>Blocked</dt><dd>${dashboard.taskCounts.blocked}</dd></div>
<div><dt>Repair attempts</dt><dd>${dashboard.repairAttemptCount}</dd></div>
<div><dt>Duration</dt><dd>${formatDuration(dashboard.durationMs)}</dd></div>
<div><dt>ETA</dt><dd>${dashboard.estimatedCompletionMs === undefined ? '—' : formatDuration(dashboard.estimatedCompletionMs)}</dd></div>
</dl>
${dashboard.currentValidationPhase === undefined ? '' : `<p class="mission-phase">Validation: ${escapeHtml(dashboard.currentValidationPhase)}</p>`}
<div class="mission-columns">
<section><h3>Task graph</h3><ul class="mission-tasks">${taskRows}</ul></section>
<section><h3>Modified files</h3>${files}</section>
</div>
<section><h3>Timeline</h3><ol class="mission-timeline">${timeline}</ol></section>
</section>`
}

export function availableActions(
  status: MissionDashboardProjection['status'],
): readonly ('pause' | 'resume' | 'cancel' | 'retry')[] {
  switch (status) {
    case 'running':
      return ['pause', 'cancel']
    case 'interrupted':
      return ['resume', 'cancel']
    case 'blocked':
    case 'failed':
      return ['retry', 'cancel']
    case 'completed':
      return []
  }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
