import type { CodemindRepoScan } from '../cli-scan.js'

export const AJNA_REPO_SCAN_PROFILE_BLOCK_ID = 'CODEMIND-AJNA-SCAN-PROFILE-01' as const

export type AjnaRepoScanProfileStatus = 'READY' | 'NEEDS_ATTENTION' | 'BLOCKED'
export type AjnaRepoScanSignalStatus = 'PASS' | 'WARN' | 'FAIL'

export type AjnaRepoScanProfileInput = Pick<
  CodemindRepoScan,
  | 'topLevelDirs'
  | 'tsFileCount'
  | 'specFileCount'
  | 'hasTypeScriptConfig'
  | 'hasEslintConfig'
  | 'hasPrettierConfig'
>

export interface AjnaRepoScanSignal {
  readonly id: string
  readonly label: string
  readonly status: AjnaRepoScanSignalStatus
  readonly evidence: string
}

export interface AjnaRepoScanRuntimeBoundary {
  readonly providerInvocationAllowed: false
  readonly repoMutationAllowed: false
  readonly githubWriteAllowed: false
  readonly commandExecutionAllowed: false
}

export interface AjnaRepoScanProfile {
  readonly blockId: typeof AJNA_REPO_SCAN_PROFILE_BLOCK_ID
  readonly status: AjnaRepoScanProfileStatus
  readonly summary: string
  readonly signals: readonly AjnaRepoScanSignal[]
  readonly recommendations: readonly string[]
  readonly runtimeBoundary: AjnaRepoScanRuntimeBoundary
}

function hasDirectory(scan: AjnaRepoScanProfileInput, name: string): boolean {
  return scan.topLevelDirs.includes(name)
}

function passSignal(id: string, label: string, evidence: string): AjnaRepoScanSignal {
  return { id, label, status: 'PASS', evidence }
}

function warnSignal(id: string, label: string, evidence: string): AjnaRepoScanSignal {
  return { id, label, status: 'WARN', evidence }
}

function failSignal(id: string, label: string, evidence: string): AjnaRepoScanSignal {
  return { id, label, status: 'FAIL', evidence }
}

function buildSignals(scan: AjnaRepoScanProfileInput): readonly AjnaRepoScanSignal[] {
  return [
    hasDirectory(scan, 'src')
      ? passSignal('source.root', 'Source root', 'src/ is present in top-level directories')
      : failSignal('source.root', 'Source root', 'src/ was not detected'),
    scan.tsFileCount > 0
      ? passSignal(
          'source.typescript',
          'TypeScript source',
          `${scan.tsFileCount} TypeScript files detected`,
        )
      : failSignal('source.typescript', 'TypeScript source', 'no TypeScript source files detected'),
    scan.specFileCount > 0
      ? passSignal('tests.present', 'Test signal', `${scan.specFileCount} spec/test files detected`)
      : warnSignal('tests.present', 'Test signal', 'no spec/test files detected'),
    scan.hasTypeScriptConfig
      ? passSignal('tooling.typescript', 'TypeScript config', 'tsconfig.json detected')
      : failSignal('tooling.typescript', 'TypeScript config', 'tsconfig.json was not detected'),
    scan.hasEslintConfig
      ? passSignal('tooling.lint', 'Lint guard', 'ESLint config detected')
      : warnSignal('tooling.lint', 'Lint guard', 'ESLint config was not detected'),
    scan.hasPrettierConfig
      ? passSignal('tooling.format', 'Format guard', 'Prettier config detected')
      : warnSignal('tooling.format', 'Format guard', 'Prettier config was not detected'),
  ]
}

function statusFromSignals(signals: readonly AjnaRepoScanSignal[]): AjnaRepoScanProfileStatus {
  if (signals.some((signal) => signal.status === 'FAIL')) {
    return 'BLOCKED'
  }
  if (signals.some((signal) => signal.status === 'WARN')) {
    return 'NEEDS_ATTENTION'
  }
  return 'READY'
}

function recommendationsFromSignals(signals: readonly AjnaRepoScanSignal[]): readonly string[] {
  const recommendations: string[] = []
  for (const signal of signals) {
    if (signal.status === 'PASS') continue
    switch (signal.id) {
      case 'source.root':
        recommendations.push(
          'Add or point CodeMind at a repository with a src/ source root before Ajna scan profiling.',
        )
        break
      case 'source.typescript':
        recommendations.push(
          'Add TypeScript source files before advancing Ajna CLI review capabilities.',
        )
        break
      case 'tests.present':
        recommendations.push(
          'Add regression tests before promoting new Ajna scan-derived behavior.',
        )
        break
      case 'tooling.typescript':
        recommendations.push(
          'Add tsconfig.json so Ajna can rely on deterministic TypeScript validation.',
        )
        break
      case 'tooling.lint':
        recommendations.push(
          'Add ESLint configuration before treating Ajna scan output as merge-ready evidence.',
        )
        break
      case 'tooling.format':
        recommendations.push(
          'Add Prettier configuration before treating Ajna scan output as format-governed evidence.',
        )
        break
    }
  }

  return recommendations.length > 0
    ? recommendations
    : ['Safe to continue read-only Ajna CLI capability development from the scan profile.']
}

function summaryForStatus(status: AjnaRepoScanProfileStatus): string {
  switch (status) {
    case 'READY':
      return 'Ajna scan profile is ready: source, tests, TypeScript, lint, and format guardrails are present.'
    case 'NEEDS_ATTENTION':
      return 'Ajna scan profile needs attention: source exists, but optional proof guardrails are incomplete.'
    case 'BLOCKED':
      return 'Ajna scan profile is blocked: required source or TypeScript proof signals are missing.'
  }
}

export function buildAjnaRepoScanProfile(scan: AjnaRepoScanProfileInput): AjnaRepoScanProfile {
  const signals = buildSignals(scan)
  const status = statusFromSignals(signals)

  return {
    blockId: AJNA_REPO_SCAN_PROFILE_BLOCK_ID,
    status,
    summary: summaryForStatus(status),
    signals,
    recommendations: recommendationsFromSignals(signals),
    runtimeBoundary: {
      providerInvocationAllowed: false,
      repoMutationAllowed: false,
      githubWriteAllowed: false,
      commandExecutionAllowed: false,
    },
  }
}

export function renderAjnaRepoScanProfile(profile: AjnaRepoScanProfile): string {
  const lines = [
    'Ajna scan profile',
    `Status: ${profile.status}`,
    `Summary: ${profile.summary}`,
    '',
    'Signals:',
    ...profile.signals.map((signal) => `  ${signal.status} ${signal.id}: ${signal.evidence}`),
    '',
    'Recommendations:',
    ...profile.recommendations.map((recommendation) => `  - ${recommendation}`),
    '',
    'Mode: READ_ONLY — no providers, writes, commands, or GitHub mutations allowed',
  ]

  return lines.join('\n')
}
