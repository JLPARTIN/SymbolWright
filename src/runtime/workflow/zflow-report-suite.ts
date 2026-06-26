import type { ZflowReportArtifactManifest, ZflowReportCatalog } from './zflow-report-catalog.js'
import { createZflowReportArtifactManifest } from './zflow-report-catalog.js'

export type ZflowReportSuiteReadiness = 'READY' | 'NEEDS_REVIEW' | 'BLOCKED'

export interface ZflowReportSuite {
  readonly title: string
  readonly generatedAt: string
  readonly catalog: ZflowReportCatalog
  readonly manifest: ZflowReportArtifactManifest
  readonly rollup: ZflowReportSuiteRollup
}

export interface ZflowReportSuiteRollup {
  readonly readiness: ZflowReportSuiteReadiness
  readonly reportCount: number
  readonly artifactCount: number
  readonly readyCount: number
  readonly needsReviewCount: number
  readonly blockedCount: number
}

export function createZflowReportSuite(input: {
  readonly title: string
  readonly catalog: ZflowReportCatalog
  readonly generatedAt?: string
}): ZflowReportSuite {
  const manifest = createZflowReportArtifactManifest(input.catalog)
  const readinessValues = input.catalog.entries.map((entry) => entry.snapshot.readiness)
  const readyCount = readinessValues.filter((readiness) => readiness === 'READY_FOR_OPERATOR_REVIEW').length
  const blockedCount = readinessValues.filter((readiness) => readiness === 'BLOCKED').length
  const needsReviewCount = readinessValues.length - readyCount - blockedCount

  const readiness: ZflowReportSuiteReadiness = blockedCount > 0
    ? 'BLOCKED'
    : needsReviewCount > 0
      ? 'NEEDS_REVIEW'
      : 'READY'

  return {
    title: input.title,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    catalog: input.catalog,
    manifest,
    rollup: {
      readiness,
      reportCount: input.catalog.entries.length,
      artifactCount: manifest.artifactCount,
      readyCount,
      needsReviewCount,
      blockedCount,
    },
  }
}

export function renderZflowReportSuiteMarkdown(suite: ZflowReportSuite): string {
  return [
    `# ${suite.title}`,
    '',
    `Generated: ${suite.generatedAt}`,
    `Readiness: ${suite.rollup.readiness}`,
    `Reports: ${suite.rollup.reportCount}`,
    `Artifacts: ${suite.rollup.artifactCount}`,
    '',
    '## Rollup',
    '',
    `Ready: ${suite.rollup.readyCount}`,
    `Needs review: ${suite.rollup.needsReviewCount}`,
    `Blocked: ${suite.rollup.blockedCount}`,
    '',
    '## Reports',
    '',
    ...suite.catalog.entries.flatMap((entry) => [
      `- ${entry.id}: ${entry.snapshot.readiness} (${entry.snapshot.localResult})`,
    ]),
    '',
    '## Boundary',
    '',
    '- Suite output is report-only.',
    '- No execution is performed.',
  ].join('\n')
}

export function renderZflowReportSuiteJson(suite: ZflowReportSuite): string {
  return JSON.stringify(
    {
      title: suite.title,
      generatedAt: suite.generatedAt,
      rollup: suite.rollup,
      catalog: suite.catalog.entries.map((entry) => ({
        id: entry.id,
        readiness: entry.snapshot.readiness,
        localResult: entry.snapshot.localResult,
        tags: entry.tags,
      })),
      manifest: suite.manifest,
    },
    null,
    2,
  )
}
