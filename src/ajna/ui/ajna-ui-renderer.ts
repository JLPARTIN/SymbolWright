import type {
  AjnaReviewPanelViewModel,
  AjnaUiCiSummaryViewModel,
  AjnaUiFileInsightViewModel,
  AjnaUiRiskLaneViewModel,
  AjnaUiTimelineStepViewModel,
} from './ajna-ui.types.js';

function renderRiskLanes(lanes: readonly AjnaUiRiskLaneViewModel[]): string {
  if (lanes.length === 0) {
    return '- No risk lanes detected.';
  }

  return lanes
    .map((lane) => `- **${lane.lane}:** ${lane.count} file(s), severity ${lane.severity}`)
    .join('\n');
}

function renderCiSummary(summary?: AjnaUiCiSummaryViewModel): string {
  if (!summary) {
    return '- No CI data available.';
  }

  return [
    `- **Total:** ${summary.total}`,
    `- **Successful:** ${summary.successful}`,
    `- **Failed:** ${summary.failed}`,
    `- **Pending:** ${summary.pending}`,
    `- **Neutral:** ${summary.neutral}`,
    `- **Healthy:** ${summary.healthy ? 'Yes' : 'No'}`,
  ].join('\n');
}

function renderTimeline(
  timeline?: readonly AjnaUiTimelineStepViewModel[],
): string {
  if (!timeline || timeline.length === 0) {
    return '- No timeline available.';
  }

  return timeline
    .map((step) => `- **${step.label}:** ${step.detail} (${step.status})`)
    .join('\n');
}

function renderFileInsights(
  insights?: readonly AjnaUiFileInsightViewModel[],
): string {
  if (!insights || insights.length === 0) {
    return '- No file insights available.';
  }

  return insights
    .map((file) => [
      `- **${file.path}**`,
      `  - Lane: ${file.lane}`,
      `  - Delta: +${file.additions} / -${file.deletions} (${file.totalDelta})`,
      `  - Score: ${file.score}`,
      `  - Severity: ${file.severity}`,
      `  - Flags: largeDelta=${file.flags.largeDelta}, protectedPath=${file.flags.protectedPath}, configurationRisk=${file.flags.configurationRisk}, testOnlySignal=${file.flags.testOnlySignal}`,
    ].join('\n'))
    .join('\n');
}

export function renderAjnaReviewPanelMarkdown(
  model: AjnaReviewPanelViewModel,
): string {
  return [
    '# CodeMind — Ajna Review Panel',
    '',
    '## Target',
    '',
    `- **Repository:** ${model.repository}`,
    `- **Pull request:** ${model.pullRequestNumber ?? 'Not provided'}`,
    '',
    '## Merge Readiness',
    '',
    `- **Ruling:** ${model.readiness.ruling}`,
    `- **Confidence:** ${(model.readiness.confidence * 100).toFixed(1)}%`,
    `- **Operator decision required:** ${model.readiness.operatorDecisionRequired ? 'Yes' : 'No'}`,
    `- **Summary:** ${model.readiness.summary}`,
    '',
    '## Review Timeline',
    '',
    renderTimeline(model.timeline),
    '',
    '## Risk Lanes',
    '',
    renderRiskLanes(model.riskLanes),
    '',
    '## Diff-Aware File Insights',
    '',
    renderFileInsights(model.fileInsights),
    '',
    '## CI Summary',
    '',
    renderCiSummary(model.ciSummary),
    '',
    '## Dry-Run Comment Preview',
    '',
    `- **Posting enabled:** ${model.commentPreview.enabled ? 'Yes' : 'No'}`,
    `- **Dry run:** ${model.commentPreview.dryRun ? 'Yes' : 'No'}`,
    '',
    '```markdown',
    model.commentPreview.markdown || 'No review content yet.',
    '```',
  ].join('\n');
}
