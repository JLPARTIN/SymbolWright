import type {
  AjnaReviewPanelViewModel,
  AjnaUiCiSummaryViewModel,
  AjnaUiRiskLaneViewModel,
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
    '## Risk Lanes',
    '',
    renderRiskLanes(model.riskLanes),
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
