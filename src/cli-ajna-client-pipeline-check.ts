import {
  getAjnaClientPipelineManifest,
  type AjnaClientPipelineManifest,
  type AjnaClientPipelineStep,
} from './cli-ajna-client-pipeline-manifest.js'

export type AjnaClientPipelineCheckStatus = 'PASS' | 'FAIL'

export interface AjnaClientPipelineCheckResult {
  readonly status: AjnaClientPipelineCheckStatus
  readonly checkedSteps: number
  readonly issues: readonly string[]
}

const EXPECTED_TITLE = 'Ajna client collector fixture pipeline'
const EXPECTED_STEPS: readonly AjnaClientPipelineStep[] = [
  {
    order: 1,
    name: 'Snapshot fixture',
    cli: 'codemind ajna client-collector-fixture <json-file>',
    result: 'collector snapshot JSON',
  },
  {
    order: 2,
    name: 'Review fixture',
    cli: 'codemind ajna review-pr-client-collector-fixture <json-file>',
    result: 'Ajna review report',
  },
  {
    order: 3,
    name: 'Readiness fixture',
    cli: 'codemind ajna merge-readiness-client-collector-fixture <json-file>',
    result: 'Ajna merge-readiness report',
  },
]

function compareStep(
  actual: AjnaClientPipelineStep | undefined,
  expected: AjnaClientPipelineStep,
): string[] {
  if (actual === undefined) {
    return [`missing step ${expected.order}: ${expected.name}`]
  }

  const issues: string[] = []
  if (actual.order !== expected.order) {
    issues.push(`step ${expected.order} order changed from ${expected.order} to ${actual.order}`)
  }
  if (actual.name !== expected.name) {
    issues.push(`step ${expected.order} name changed from ${expected.name} to ${actual.name}`)
  }
  if (actual.cli !== expected.cli) {
    issues.push(`step ${expected.order} command changed from ${expected.cli} to ${actual.cli}`)
  }
  if (actual.result !== expected.result) {
    issues.push(`step ${expected.order} output changed from ${expected.result} to ${actual.result}`)
  }
  return issues
}

export function findAjnaClientPipelineManifestIssues(
  manifest: AjnaClientPipelineManifest = getAjnaClientPipelineManifest(),
): readonly string[] {
  const issues: string[] = []

  if (manifest.title !== EXPECTED_TITLE) {
    issues.push(`title changed from ${EXPECTED_TITLE} to ${manifest.title}`)
  }
  if (manifest.mode !== 'READ_ONLY') {
    issues.push(`mode changed from READ_ONLY to ${manifest.mode}`)
  }
  if (manifest.steps.length !== EXPECTED_STEPS.length) {
    issues.push(`step count changed from ${EXPECTED_STEPS.length} to ${manifest.steps.length}`)
  }

  EXPECTED_STEPS.forEach((expected, index) => {
    issues.push(...compareStep(manifest.steps[index], expected))
  })

  return issues
}

export function buildAjnaClientPipelineCheckResult(
  manifest: AjnaClientPipelineManifest = getAjnaClientPipelineManifest(),
): AjnaClientPipelineCheckResult {
  const issues = findAjnaClientPipelineManifestIssues(manifest)
  return {
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    checkedSteps: manifest.steps.length,
    issues,
  }
}

export function renderAjnaClientPipelineCheck(
  result: AjnaClientPipelineCheckResult = buildAjnaClientPipelineCheckResult(),
): string {
  return [
    'Ajna client pipeline check',
    `Status: ${result.status}`,
    `Checked steps: ${result.checkedSteps}`,
    result.issues.length === 0
      ? 'Issues: None'
      : ['Issues:', ...result.issues.map((issue) => `- ${issue}`)].join('\n'),
    '',
    'Mode: READ_ONLY',
  ].join('\n')
}
