import type { SymbolWrightChangedFileContext } from '../../repo-context/repo-context.types.js'

export interface AjnaFileInsightFlags {
  readonly largeDelta: boolean
  readonly protectedPath: boolean
  readonly configurationRisk: boolean
  readonly testOnlySignal: boolean
}

export interface AjnaFileInsight {
  readonly path: string
  readonly changeType: SymbolWrightChangedFileContext['changeType']
  readonly impactLevel: SymbolWrightChangedFileContext['impactLevel']
  readonly additions: number
  readonly deletions: number
  readonly totalDelta: number
  readonly score: number
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'
  readonly flags: AjnaFileInsightFlags
  readonly notes: readonly string[]
}

function isConfigurationPath(path: string): boolean {
  const normalized = path.toLowerCase()
  return (
    normalized.endsWith('.json') ||
    normalized.endsWith('.yml') ||
    normalized.endsWith('.yaml') ||
    normalized.endsWith('.toml') ||
    normalized.includes('.github/workflows/') ||
    normalized.includes('package.json') ||
    normalized.includes('tsconfig')
  )
}

function isTestPath(path: string): boolean {
  const normalized = path.toLowerCase()
  return (
    normalized.includes('/test/') ||
    normalized.includes('/tests/') ||
    normalized.includes('.spec.') ||
    normalized.includes('.test.')
  )
}

function scoreToSeverity(score: number): AjnaFileInsight['severity'] {
  if (score >= 6) {
    return 'CRITICAL'
  }

  if (score >= 4) {
    return 'HIGH'
  }

  if (score >= 2) {
    return 'MEDIUM'
  }

  return 'LOW'
}

export function computeAjnaFileRiskScore(file: SymbolWrightChangedFileContext): number {
  const totalDelta = file.additions + file.deletions
  let score = 0

  if (totalDelta > 500) {
    score += 3
  } else if (totalDelta > 200) {
    score += 2
  } else if (totalDelta > 50) {
    score += 1
  }

  if (file.impactLevel === 'CRITICAL') {
    score += 4
  } else if (file.impactLevel === 'HIGH') {
    score += 3
  } else if (file.impactLevel === 'MEDIUM') {
    score += 1
  }

  if (file.protectedPath) {
    score += 2
  }

  if (isConfigurationPath(file.path)) {
    score += 1
  }

  if (isTestPath(file.path)) {
    score -= 1
  }

  return Math.max(score, 0)
}

export function buildAjnaFileInsights(
  changedFiles: readonly SymbolWrightChangedFileContext[],
): readonly AjnaFileInsight[] {
  return changedFiles.map((file) => {
    const totalDelta = file.additions + file.deletions
    const score = computeAjnaFileRiskScore(file)

    return {
      path: file.path,
      changeType: file.changeType,
      impactLevel: file.impactLevel,
      additions: file.additions,
      deletions: file.deletions,
      totalDelta,
      score,
      severity: scoreToSeverity(score),
      flags: {
        largeDelta: totalDelta > 200,
        protectedPath: file.protectedPath,
        configurationRisk: isConfigurationPath(file.path),
        testOnlySignal: isTestPath(file.path),
      },
      notes: file.notes,
    }
  })
}
