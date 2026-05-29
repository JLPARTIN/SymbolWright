import type { AjnaReviewSession } from './ajna-review-session.js';
import type { AjnaProofBundle } from './ajna-proof-bundle.js';
import type { AjnaRiskSynthesis } from './ajna-risk-synthesis.js';
import type { AjnaMergeDecision } from './ajna-merge-decision.js';

export const AJNA_REVIEW_REPORT_COMPOSER_BLOCK_ID =
  'CODEMIND-AJNA-REVIEW-05' as const;
export const AJNA_REVIEW_REPORT_COMPOSER_PR_ID = 'PR-CM-AJNA-05' as const;
export const AJNA_REVIEW_REPORT_COMPOSER_PHASE_ID = 'CODEMIND-AJNA-05' as const;

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
  readonly format: AjnaReviewReportFormat;
  /** ISO timestamp — omit for deterministic output. */
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

function buildPlainLines(
  input: AjnaReviewReportComposerInput,
): readonly string[] {
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

  lines.push(
    '',
    'Risk Synthesis:',
    `  Level:    ${riskSynthesis.riskLevel}`,
  );
  riskSynthesis.explanation.forEach((e) => lines.push(`  ${e}`));

  lines.push(
    '',
    'Merge Decision:',
    `  State:    ${mergeDecision.state}`,
  );
  mergeDecision.reasons.forEach((r) => lines.push(`  ${r}`));

  lines.push(
    '',
    'Runtime Boundary:',
    `  providerInvocationAllowed: false`,
    `  repoMutationAllowed: false`,
    `  githubWriteAllowed: false`,
    `  commandExecutionAllowed: false`,
    '',
    'Validation:',
    '  npm run typecheck',
    '  npm test',
    '  npm run build',
  );

  return lines;
}

function buildMarkdownLines(
  input: AjnaReviewReportComposerInput,
): readonly string[] {
  const { session, proofBundle, riskSynthesis, mergeDecision } = input;
  const id = session.identity;

  const lines: string[] = [
    `## Ajna Review — ${id.repository} #${id.pullRequestNumber}`,
    '',
    `**Session:** \`${session.sessionId}\`  `,
    `**Head:** \`${id.headSha}\`  `,
    `**Base:** \`${id.baseSha}\`  `,
  ];

  if (input.renderedAt !== undefined) {
    lines.push(`**Rendered:** ${input.renderedAt}  `);
  }

  lines.push(
    '',
    '### Proof Bundle',
    '',
    `- Gate: \`${proofBundle.proofGateStatus}\``,
    `- All ready: \`${String(proofBundle.allProofReady)}\``,
  );

  if (proofBundle.missingProofDomains.length > 0) {
    lines.push(`- Missing: ${proofBundle.missingProofDomains.join(', ')}`);
  }
  if (proofBundle.blockingProofDomains.length > 0) {
    lines.push(`- Blocked: ${proofBundle.blockingProofDomains.join(', ')}`);
  }
  if (proofBundle.invalidProofDomains.length > 0) {
    lines.push(`- Invalid: ${proofBundle.invalidProofDomains.join(', ')}`);
  }

  lines.push(
    '',
    '### Risk Synthesis',
    '',
    `**Level:** \`${riskSynthesis.riskLevel}\``,
    '',
  );
  riskSynthesis.explanation.forEach((e) => lines.push(`- ${e}`));

  lines.push(
    '',
    '### Merge Decision',
    '',
    `**State:** \`${mergeDecision.state}\``,
    '',
  );
  mergeDecision.reasons.forEach((r) => lines.push(`- ${r}`));

  lines.push(
    '',
    '### Validation',
    '',
    '```bash',
    'npm run typecheck',
    'npm test',
    'npm run build',
    '```',
  );

  return lines;
}

function buildCompactLine(
  input: AjnaReviewReportComposerInput,
): string {
  const id = input.session.identity;
  return `[${input.mergeDecision.state}] ${id.repository}#${id.pullRequestNumber} | risk:${input.riskSynthesis.riskLevel} | gate:${input.proofBundle.proofGateStatus}`;
}

export function composeAjnaReviewReport(
  input: AjnaReviewReportComposerInput,
): AjnaReviewReport {
  let lines: readonly string[];

  switch (input.format) {
    case 'plain':
      lines = buildPlainLines(input);
      break;
    case 'markdown':
      lines = buildMarkdownLines(input);
      break;
    case 'compact':
      lines = [buildCompactLine(input)];
      break;
  }

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
