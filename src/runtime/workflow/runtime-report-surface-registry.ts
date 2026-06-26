export interface RuntimeReportSurfaceEntry {
  readonly name: string
  readonly kind: 'model' | 'renderer' | 'tool' | 'cli'
  readonly module: string
  readonly formats: readonly ('markdown' | 'json')[]
  readonly safetyFlags: {
    readonly readOnly: true
    readonly noExecution: true
    readonly noNetwork: true
    readonly noFileWrite: true
  }
}

export interface RuntimeReportSurfaceRegistry {
  readonly title: string
  readonly generatedAt: string
  readonly entries: readonly RuntimeReportSurfaceEntry[]
  readonly entryCount: number
}

const SURFACE_ENTRIES: readonly RuntimeReportSurfaceEntry[] = [
  {
    name: 'zflow-report',
    kind: 'model',
    module: 'src/runtime/workflow/zflow-report.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'zflow-report-catalog',
    kind: 'model',
    module: 'src/runtime/workflow/zflow-report-catalog.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'zflow-report-suite',
    kind: 'model',
    module: 'src/runtime/workflow/zflow-report-suite.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'zflow-report-rollup',
    kind: 'tool',
    module: 'src/runtime/tools/zflow-report-rollup-tool.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'runtime-report-index',
    kind: 'model',
    module: 'src/runtime/workflow/runtime-report-index.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'runtime-report-note',
    kind: 'model',
    module: 'src/runtime/workflow/runtime-report-release-note.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'runtime-report-bundle-manifest',
    kind: 'model',
    module: 'src/runtime/workflow/runtime-report-bundle-manifest.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'runtime-report-collection',
    kind: 'model',
    module: 'src/runtime/workflow/runtime-report-collection.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'runtime-report-hub',
    kind: 'model',
    module: 'src/runtime/workflow/runtime-report-hub.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'cli-runtime-report-index',
    kind: 'cli',
    module: 'src/cli-runtime-report-index.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'cli-runtime-report-note',
    kind: 'cli',
    module: 'src/cli-runtime-report-note.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'cli-runtime-report-collection',
    kind: 'cli',
    module: 'src/cli-runtime-report-collection.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
  {
    name: 'cli-runtime-report-hub',
    kind: 'cli',
    module: 'src/cli-runtime-report-hub.ts',
    formats: ['markdown', 'json'],
    safetyFlags: { readOnly: true, noExecution: true, noNetwork: true, noFileWrite: true },
  },
]

export function createRuntimeReportSurfaceRegistry(input?: {
  readonly generatedAt?: string
}): RuntimeReportSurfaceRegistry {
  const generatedAt = input?.generatedAt ?? new Date().toISOString()

  return {
    title: 'Runtime Report Surface Registry',
    generatedAt,
    entries: SURFACE_ENTRIES,
    entryCount: SURFACE_ENTRIES.length,
  }
}

export function renderRuntimeReportSurfaceRegistryMarkdown(
  registry: RuntimeReportSurfaceRegistry,
): string {
  return [
    `# ${registry.title}`,
    '',
    `Generated: ${registry.generatedAt}`,
    `Surfaces: ${registry.entryCount}`,
    '',
    '## Surfaces',
    '',
    ...registry.entries.map(
      (entry) => `- ${entry.name} (${entry.kind}) — formats: ${entry.formats.join(', ')}`,
    ),
    '',
    '## Safety',
    '',
    '- All surfaces are read-only.',
    '- No execution is performed.',
    '- No network access.',
    '- No file writes.',
  ].join('\n')
}

export function renderRuntimeReportSurfaceRegistryJson(
  registry: RuntimeReportSurfaceRegistry,
): string {
  return JSON.stringify(registry, null, 2)
}
