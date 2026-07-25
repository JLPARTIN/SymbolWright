export interface AjnaDocsReference {
  readonly title: string
  readonly hub: string
  readonly quickStart: string
  readonly planningDocs: readonly string[]
  readonly commandDocs: readonly string[]
  readonly boundary: readonly string[]
}

export function getAjnaDocsReference(): AjnaDocsReference {
  return {
    title: 'Ajna docs reference',
    hub: 'docs/ajna/SYMBOLWRIGHT_AJNA_DOCS_HUB.md',
    quickStart: 'docs/ajna-fixture-command-index.md',
    planningDocs: [
      'docs/ajna/SYMBOLWRIGHT_AJNA_ROADMAP.md',
      'docs/ajna/SYMBOLWRIGHT_AJNA_BUILD_PLAN.md',
    ],
    commandDocs: [
      'docs/ajna-docs-command.md',
      'docs/ajna-client-pipeline-manifest-command.md',
      'docs/ajna-client-pipeline-status-command.md',
      'docs/ajna-client-collector-fixture-command.md',
      'docs/ajna-review-pr-client-collector-fixture-command.md',
      'docs/ajna-merge-readiness-client-collector-fixture-command.md',
    ],
    boundary: [
      'local-first documentation reference only',
      'no live GitHub ingestion',
      'no provider calls',
      'no PR comments',
      'no repository mutation',
    ],
  }
}

export function renderAjnaDocsReference(
  reference: AjnaDocsReference = getAjnaDocsReference(),
): string {
  return [
    reference.title,
    '',
    `Hub: ${reference.hub}`,
    `Quick start: ${reference.quickStart}`,
    '',
    'Planning docs:',
    ...reference.planningDocs.map((path) => `- ${path}`),
    '',
    'Command docs:',
    ...reference.commandDocs.map((path) => `- ${path}`),
    '',
    'Boundary:',
    ...reference.boundary.map((item) => `- ${item}`),
  ].join('\n')
}
