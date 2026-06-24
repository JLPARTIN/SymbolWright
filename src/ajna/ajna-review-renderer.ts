import type { AjnaReviewFinding, AjnaReviewResponse } from './ajna-review.types.js'

function renderList(items: readonly string[]): string {
  if (items.length === 0) {
    return '- None reported.'
  }

  return items.map((item) => `- ${item}`).join('\n')
}

function renderFinding(finding: AjnaReviewFinding): string {
  const evidenceLines = finding.evidence.map(
    (evidence) => `  - **${evidence.evidenceClass}:** ${evidence.summary}`,
  )

  return [
    `### ${finding.title}`,
    '',
    `- **ID:** ${finding.id}`,
    `- **Category:** ${finding.category}`,
    `- **Risk:** ${finding.risk}`,
    `- **Blocks merge:** ${finding.blocksMerge ? 'Yes' : 'No'}`,
    `- **Affected files:** ${finding.affectedFiles.length > 0 ? finding.affectedFiles.join(', ') : 'None reported'}`,
    '',
    finding.summary,
    '',
    '**Evidence**',
    evidenceLines.length > 0 ? evidenceLines.join('\n') : '- None reported.',
    '',
    `**Recommendation:** ${finding.recommendation}`,
  ].join('\n')
}

export function renderAjnaReviewReport(response: AjnaReviewResponse): string {
  const changedFiles = Array.from(
    new Set([
      ...(response.changedFiles ?? []),
      ...response.findings.flatMap((finding) => finding.affectedFiles),
    ]),
  ).sort()
  const blockingFindings = response.findings.filter((finding) => finding.blocksMerge)

  return [
    '# Ajna Review Cortex Report',
    '',
    `> ${response.tagline}`,
    `> ${response.subtitle}`,
    '',
    '## Summary',
    '',
    `- **Repository:** ${response.subject.repository}`,
    `- **PR:** ${response.subject.pullRequestNumber ?? 'Not provided'}`,
    `- **Base:** ${response.subject.baseRef}`,
    `- **Head:** ${response.subject.headRef}`,
    `- **Findings:** ${response.findings.length}`,
    `- **Blocking findings:** ${blockingFindings.length}`,
    '',
    '## Files Changed / Affected',
    '',
    renderList(changedFiles),
    '',
    '## Risk Map',
    '',
    response.findings.length > 0
      ? response.findings
          .map((finding) => `- **${finding.risk}:** ${finding.title} (${finding.category})`)
          .join('\n')
      : '- No findings reported.',
    '',
    '## Evidence',
    '',
    response.findings.length > 0
      ? response.findings
          .flatMap((finding) =>
            finding.evidence.map(
              (evidence) => `- **${finding.id} / ${evidence.evidenceClass}:** ${evidence.summary}`,
            ),
          )
          .join('\n') || '- No evidence reported.'
      : '- No evidence reported.',
    '',
    '## Architecture Impact',
    '',
    response.findings.some((finding) => finding.category === 'ARCHITECTURE_DRIFT')
      ? renderList(
          response.findings
            .filter((finding) => finding.category === 'ARCHITECTURE_DRIFT')
            .map((finding) => finding.summary),
        )
      : '- No architecture drift findings reported.',
    '',
    '## Security Notes',
    '',
    response.findings.some((finding) => finding.category === 'SECURITY_SENSITIVE_CHANGE')
      ? renderList(
          response.findings
            .filter((finding) => finding.category === 'SECURITY_SENSITIVE_CHANGE')
            .map((finding) => finding.summary),
        )
      : '- No security-sensitive findings reported.',
    '',
    '## Findings',
    '',
    response.findings.length > 0
      ? response.findings.map((finding) => renderFinding(finding)).join('\n\n')
      : '- No findings reported.',
    '',
    '## Merge-Readiness',
    '',
    `- **Status:** ${response.mergeReadiness.status}`,
    `- **Summary:** ${response.mergeReadiness.summary}`,
    `- **Required evidence present:** ${response.mergeReadiness.requiredEvidencePresent ? 'Yes' : 'No'}`,
    `- **Operator decision required:** ${response.mergeReadiness.operatorDecisionRequired ? 'Yes' : 'No'}`,
    `- **Blocking finding IDs:** ${response.mergeReadiness.blockingFindings.length > 0 ? response.mergeReadiness.blockingFindings.join(', ') : 'None'}`,
    '',
    '## Recommended Next Action',
    '',
    response.recommendedNextAction,
  ].join('\n')
}
