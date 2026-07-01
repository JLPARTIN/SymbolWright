import type { ChangedFileAnalysis, FileKind, RiskLevel } from './types.js'

const FORMATTED = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yml', '.yaml'] as const
const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
] as const

export function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll(String.fromCharCode(92), '/').replace(/^[.][/]/, '')
}

function endsWithAny(filePath: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => filePath.endsWith(suffix))
}

function kindForPath(filePath: string): FileKind {
  const name = filePath.split('/').at(-1) ?? filePath
  if (LOCKFILES.includes(name as (typeof LOCKFILES)[number])) return 'lockfile'
  if (name === 'package.json') return 'package-metadata'
  if (filePath.startsWith('.github/workflows/') && endsWithAny(filePath, ['.yml', '.yaml'])) {
    return 'workflow'
  }
  if (
    filePath.includes('__tests__') ||
    filePath.includes('/tests/') ||
    filePath.includes('.spec.') ||
    filePath.includes('.test.')
  ) {
    return 'test'
  }
  if (filePath.endsWith('.md')) return 'documentation'
  if (filePath.startsWith('src/') && endsWithAny(filePath, ['.ts', '.tsx', '.js', '.jsx'])) {
    return 'source'
  }
  if (endsWithAny(filePath, ['.json', '.yml', '.yaml'])) return 'config'
  return 'unknown'
}

function riskForKind(kind: FileKind): RiskLevel {
  if (kind === 'package-metadata' || kind === 'lockfile' || kind === 'workflow') return 'high'
  if (kind === 'source' || kind === 'test' || kind === 'config') return 'medium'
  return 'low'
}

function gatesForKind(kind: FileKind): readonly string[] {
  if (kind === 'package-metadata') return ['package-contract']
  if (kind === 'lockfile') return ['lockfile-contract']
  if (kind === 'workflow') return ['workflow-validation']
  return []
}

export function classifyChangedFile(filePath: string): ChangedFileAnalysis {
  const normalizedPath = normalizeRepoPath(filePath)
  const kind = kindForPath(normalizedPath)
  const sourceOrTest = kind === 'source' || kind === 'test'

  return {
    originalPath: filePath,
    normalizedPath,
    kind,
    riskLevel: riskForKind(kind),
    requiresFormat: endsWithAny(normalizedPath, FORMATTED),
    requiresLint: sourceOrTest,
    requiresTypecheck: sourceOrTest && endsWithAny(normalizedPath, ['.ts', '.tsx']),
    requiresTest: sourceOrTest,
    requiresBuild: kind === 'source',
    forensicGates: gatesForKind(kind),
  }
}

export function classifyChangedFiles(changedFiles: readonly string[]): readonly ChangedFileAnalysis[] {
  return changedFiles.map(classifyChangedFile)
}
