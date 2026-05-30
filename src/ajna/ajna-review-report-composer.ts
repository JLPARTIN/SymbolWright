import type { AjnaReviewSession } from './ajna-review-session.js';
import type { AjnaProofBundle } from './ajna-proof-bundle.js';
import type { AjnaRiskSynthesis } from './ajna-risk-synthesis.js';
import type { AjnaMergeDecision } from './ajna-merge-decision.js';
import type { AjnaRenderedGovernanceReport } from './governance/ajna-governance-renderer.js';

export const AJNA_REVIEW_REPORT_COMPOSER_BLOCK_ID =
  'CODEMIND-AJNA-REVIEW-09' as const;
export const AJNA_REVIEW_REPORT_COMPOSER_PR_ID = 'PR-CM-AJNA-09' as const;
export const AJNA_REVIEW_REPORT_COMPOSER_PHASE_ID = 'CODEMIND-AJNA-09' as const;

export const AJNA_REVIEW_REPORT_FORMATS = [
  'plain',
  'markdown',
  'compact',
] as const;
export type AjnaReviewReportFormat =
  (typeof AJNA_REVIEW_REPORT_FORMATS)[number];

export interface AjnaReviewReportComposerInput {
  readonly session: AjnaReviewSession;
  readonly proofBundle: AjnaProofBundle;
  readonly riskSynthesis: AjnaRiskSynthesis;
  readonly mergeDecision: AjnaMergeDecision;
  readonly governanceReport?: AjnaRenderedGovernanceReport;
  readonly format: AjnaReviewReportFormat;
  readonly renderedAt?: string;
}

export interface AjnaReviewReport {
  readonly blockId: typeof AJNA_REVIEW_REPORT_COMPOSER_BLOCK_ID;
  readonly prId: typeof AJNA_REVIEW_REPORT_COMPOSER_PR_ID;
  readonly phaseId: typeof AJNA_REVIEW_REPORT_COMPOSER_PHASE_ID;
  readonly format: AjnaReviewReportFormat;
  readonly text: string;
  readonly lineCount: number;
  readonly mutationAllowed: false;
  readonly githubWriteAllowed: false;
  readonly providerInvocationAllowed: false;
}

function governanceLines(report: AjnaRenderedGovernanceReport | undefined): string[] {
  if (!report) {
    return [];
  }

  const lines = [
    '',
    'Governance Rules:',
    `  All passed: ${String(report.allPassed)}`,
    `  Passed:     ${report.passedRules}/${report.totalRules}`,
    `  Failed:     ${report.failedRules}`,
  ];

  for (const result of report.results) {
    const status = result.passed ? 'PASS' : result.overridden ? 'OVERRIDDEN' : 'FAIL';
    lines.push(`  [${status}] ${result.id}: ${result.detail}`);
  }

  return lines;
}

function buildPlainLines(input: AjnaReviewReportComposerInput): readonly string[] {
  const { session, proofBundle, riskSynthesis, mergeDecision } = input;
  const id = session.identity;

  const lines: string[] = [
    '=== Ajna Review Report ===',
    '',
    `Repository: ${id.repository}`,
    `PR:         #${id.pullRequestNumber}`,
    `Head SHA:   ${id.headSha}`,
    `Base SHA:   ${id.baseSha}`,
    `Session:    ${session.sessionId}`,
  ];

  if (input.renderedAt !== undefined) {
    lines.push(`Rendered:   ${input.renderedAt}`);
  }

  lines.push(
    '',
    'Proof Bundle:',
    `  Gate:     ${proofBundle.proofGateStatus}`,
    `  Ready:    ${String(proofBundle.allProofReady)}`,
  );

  if (proofBundle.missingProofDomains.length > 0) {
    lines.push(`  Missing:  ${proofBundle.missingProofDomains.join(', ')}`);
  }
  if (proofBundle.blockingProofDomains.length > 0) {
    lines.push(`  Blocked:  ${proofBundle.blockingProofDomains.join(', ')}`);
  }
  if (proofBundle.invalidProofDomains.length > 0) {
    lines.push(`  Invalid:  ${proofBundle.invalidProofDomains.join(', ')}`);
  }

  lines.push(...governanceLines(input.governanceReport));

  lines.push('', 'Risk Synthesis:', `  Level:    ${riskSynthesis.riskLevel}`);
  riskSynthesis.explanation.forEach((entry) => lines.push(`  ${entry}`));

  lines.push('', 'Merge Decision:', `  State:    ${mergeDecision.state}`);
  mergeDecision.reasons.forEach((reason) => lines.push(`  ${reason}`));

  lines.push(
    '',
    'Runtime Boundary:',
    '  providerInvocationAllowed: false',
    '  repoMutationAllowed: false',
    '  githubWriteAllowed: false',
    '  commandExecutionAllowed: false',
    '',
    'Validation:',
    '  npm run typecheck',
    '  npm test',
    '  npm run build',
  );

  return lines;
}

function buildMarkdownLines(input: AjnaReviewReportComposerInput): readonly string[] {
  const { session, proofBundle, riskSynthesis, mergeDecision } = input;
  const id = session.identity;
  const lines: string[] = [
    `## Ajna Review — ${id.repository} #${id.pullRequestNumber}`,
    '',
    `**Session:** \`${session.sessionId}\`  `,
    `**Head:** \`${id.headSha}\`  `,
    `**Base:** \`${id.baseSha}\`  `,
    '',
    '### Proof Bundle',
    '',
    `- Gate: \`${proofBundle.proofGateStatus}\``,
    `- All ready: \`${String(proofBundle.allProofReady)}\``,
  ];

  if (input.governanceReport) {
    lines.push(
      '',
      '### Governance Rules',
      '',
      `- All passed: \`${String(input.governanceReport.allPassed)}\``,
      `- Passed: \`${input.governanceReport.passedRules}/${input.governanceReport.totalRules}\``,
      `- Failed: \`${input.governanceReport.failedRules}\``,
    );
    input.governanceReport.results.forEach((result) => {
      const status = result.passed ? 'PASS' : result.overridden ? 'OVERRIDDEN' : 'FAIL';
      lines.push(`- \`${status}\` ${result.id}: ${result.detail}`);
    });
  }

  lines.push(
    '',
    '### Risk Synthesis',
    '',
    `**Level:** \`${riskSynthesis.riskLevel}\``,
    '',
  );
  riskSynthesis.explanation.forEach((entry) => lines.push(`- ${entry}`));

  lines.push(
    '',
    '### Merge Decision',
    '',
    `**State:** \`${mergeDecision.state}\``,
    '',
  );
  mergeDecision.reasons.forEach((reason) => lines.push(`- ${reason}`));

  return lines;
}

function buildCompactLine(input: AjnaReviewReportComposerInput): string {
  const id = input.session.identity;
  const governance = input.governanceReport
    ? ` | governance:${input.governanceReport.passedRules}/${input.governanceReport.totalRules}`
    : '';
  return `[${input.mergeDecision.state}] ${id.repository}#${id.pullRequestNumber} | risk:${input.riskSynthesis.riskLevel} | gate:${input.proofBundle.proofGateStatus}${governance}`;
}

export function composeAjnaReviewReport(
  input: AjnaReviewReportComposerInput,
): AjnaReviewReport {
  const lines =
    input.format === 'compact'
      ? [buildCompactLine(input)]
      : input.format === 'markdown'
        ? buildMarkdownLines(input)
        : buildPlainLines(input);

  return {
    blockId: AJNA_REVIEW_REPORT_COMPOSER_BLOCK_ID,
    prId: AJNA_REVIEW_REPORT_COMPOSER_PR_ID,
    phaseId: AJNA_REVIEW_REPORT_COMPOSER_PHASE_ID,
    format: input.format,
    text: lines.join('\n'),
    lineCount: lines.length,
    mutationAllowed: false,
    githubWriteAllowed: false,
    providerInvocationAllowed: false,
  };
}
