export interface AjnaClientPipelineStep {
  readonly order: number
  readonly name: string
  readonly cli: string
  readonly result: string
}

export interface AjnaClientPipelineManifest {
  readonly title: string
  readonly mode: 'READ_ONLY'
  readonly steps: readonly AjnaClientPipelineStep[]
}

export function getAjnaClientPipelineManifest(): AjnaClientPipelineManifest {
  return {
    title: 'Ajna client collector fixture pipeline',
    mode: 'READ_ONLY',
    steps: [
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
    ],
  }
}

export function renderAjnaClientPipelineManifest(
  manifest: AjnaClientPipelineManifest = getAjnaClientPipelineManifest(),
): string {
  return [
    manifest.title,
    `Mode: ${manifest.mode}`,
    '',
    'Steps:',
    ...manifest.steps.map(
      (step) => `${step.order}. ${step.name}\n   Command: ${step.cli}\n   Output: ${step.result}`,
    ),
  ].join('\n')
}
