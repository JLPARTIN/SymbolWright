import path from 'node:path'

import type {
  RepositoryImportRecord,
  RepositorySemanticIndexSnapshot,
} from './repository-semantic-index.types.js'

export type RepositoryImpactRisk = 'low' | 'medium' | 'high' | 'critical'

export interface RepositoryImpactAnalysis {
  readonly changedFiles: readonly string[]
  readonly directlyAffectedFiles: readonly string[]
  readonly transitivelyAffectedFiles: readonly string[]
  readonly affectedPackages: readonly string[]
  readonly affectedExportedSymbols: readonly string[]
  readonly validationCommands: readonly string[]
  readonly risk: RepositoryImpactRisk
  readonly riskScore: number
  readonly reasons: readonly string[]
}

export interface RepositoryImpactAnalysisOptions {
  readonly validationCommands?: readonly string[]
  readonly maxTraversalDepth?: number
}

const DEFAULT_VALIDATION_COMMANDS = [
  'npm run typecheck',
  'npm run lint',
  'npm test',
  'npm run build',
] as const

const RUNTIME_IMPORT_EXTENSION = /\.(?:[cm]?js|jsx)$/

export function analyzeRepositoryImpact(
  snapshot: RepositorySemanticIndexSnapshot,
  changedFiles: readonly string[],
  options: RepositoryImpactAnalysisOptions = {},
): RepositoryImpactAnalysis {
  const normalizedChanges = uniqueSorted(changedFiles.map(normalizeRepositoryPath))
  const knownFiles = new Set(snapshot.files.map((file) => normalizeRepositoryPath(file.path)))
  const unknownFiles = normalizedChanges.filter((file) => !knownFiles.has(file))
  const reverseDependencies = buildReverseDependencies(snapshot)
  const directlyAffected = new Set<string>()
  const transitivelyAffected = new Set<string>()
  const maxDepth = options.maxTraversalDepth ?? 20

  for (const changedFile of normalizedChanges) {
    for (const importer of reverseDependencies.get(changedFile) ?? []) directlyAffected.add(importer)
    traverseImporters(
      changedFile,
      reverseDependencies,
      directlyAffected,
      transitivelyAffected,
      maxDepth,
    )
  }

  for (const changedFile of normalizedChanges) {
    directlyAffected.delete(changedFile)
    transitivelyAffected.delete(changedFile)
  }
  for (const direct of directlyAffected) transitivelyAffected.delete(direct)

  const allAffected = new Set([...normalizedChanges, ...directlyAffected, ...transitivelyAffected])
  const affectedPackages = uniqueSorted(
    snapshot.files
      .filter((file) => allAffected.has(normalizeRepositoryPath(file.path)))
      .map((file) => file.packageOwner)
      .filter((owner): owner is string => owner !== undefined && owner.length > 0),
  )
  const affectedExportedSymbols = uniqueSorted(
    snapshot.symbols
      .filter(
        (symbol) =>
          symbol.exported && normalizedChanges.includes(normalizeRepositoryPath(symbol.filePath)),
      )
      .map((symbol) => symbol.name),
  )

  const reasons: string[] = []
  let riskScore = 0
  riskScore += Math.min(30, normalizedChanges.length * 5)
  riskScore += Math.min(25, directlyAffected.size * 3)
  riskScore += Math.min(20, transitivelyAffected.size)
  riskScore += Math.min(15, affectedExportedSymbols.length * 3)
  riskScore += Math.min(10, Math.max(0, affectedPackages.length - 1) * 5)
  if (affectedPackages.length > 1 && affectedExportedSymbols.length > 0) riskScore += 5
  if (unknownFiles.length > 0) riskScore += 10
  riskScore = Math.min(100, riskScore)

  if (normalizedChanges.length > 3) reasons.push(`${normalizedChanges.length} files are changing.`)
  if (directlyAffected.size > 0) {
    reasons.push(`${directlyAffected.size} direct importers are affected.`)
  }
  if (transitivelyAffected.size > 0) {
    reasons.push(`${transitivelyAffected.size} transitive importers are affected.`)
  }
  if (affectedExportedSymbols.length > 0) {
    reasons.push(`${affectedExportedSymbols.length} exported symbols may change contract behavior.`)
  }
  if (affectedPackages.length > 1) {
    reasons.push(`The change crosses ${affectedPackages.length} package boundaries.`)
  }
  if (unknownFiles.length > 0) {
    reasons.push(`${unknownFiles.length} changed files are absent from the semantic index.`)
  }
  if (reasons.length === 0) {
    reasons.push('The change is isolated to indexed files with no known importers.')
  }

  return {
    changedFiles: normalizedChanges,
    directlyAffectedFiles: uniqueSorted(directlyAffected),
    transitivelyAffectedFiles: uniqueSorted(transitivelyAffected),
    affectedPackages,
    affectedExportedSymbols,
    validationCommands:
      options.validationCommands === undefined
        ? DEFAULT_VALIDATION_COMMANDS
        : uniqueSorted(options.validationCommands),
    risk: riskForScore(riskScore),
    riskScore,
    reasons,
  }
}

function buildReverseDependencies(
  snapshot: RepositorySemanticIndexSnapshot,
): ReadonlyMap<string, ReadonlySet<string>> {
  const knownFiles = new Set(snapshot.files.map((file) => normalizeRepositoryPath(file.path)))
  const reverse = new Map<string, Set<string>>()
  for (const record of snapshot.imports) {
    const importer = normalizeRepositoryPath(record.filePath)
    const imported = resolveImportTarget(record, knownFiles)
    if (imported === undefined) continue
    const importers = reverse.get(imported) ?? new Set<string>()
    importers.add(importer)
    reverse.set(imported, importers)
  }
  return reverse
}

function resolveImportTarget(
  record: RepositoryImportRecord,
  knownFiles: ReadonlySet<string>,
): string | undefined {
  if (!record.source.startsWith('.')) return undefined
  const importerDirectory = path.posix.dirname(normalizeRepositoryPath(record.filePath))
  const exactBase = normalizeRepositoryPath(path.posix.join(importerDirectory, record.source))
  const sourceBase = exactBase.replace(RUNTIME_IMPORT_EXTENSION, '')
  const candidates = [
    exactBase,
    sourceBase,
    `${sourceBase}.ts`,
    `${sourceBase}.tsx`,
    `${sourceBase}.js`,
    `${sourceBase}.jsx`,
    `${sourceBase}.mts`,
    `${sourceBase}.cts`,
    `${sourceBase}.mjs`,
    `${sourceBase}.cjs`,
    path.posix.join(sourceBase, 'index.ts'),
    path.posix.join(sourceBase, 'index.tsx'),
    path.posix.join(sourceBase, 'index.js'),
  ]
  return uniqueSorted(candidates).find((candidate) => knownFiles.has(candidate))
}

function traverseImporters(
  changedFile: string,
  reverseDependencies: ReadonlyMap<string, ReadonlySet<string>>,
  direct: ReadonlySet<string>,
  transitive: Set<string>,
  maxDepth: number,
): void {
  const queue = [...(reverseDependencies.get(changedFile) ?? [])].map((file) => ({
    file,
    depth: 1,
  }))
  const visited = new Set<string>([changedFile])
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || visited.has(current.file)) continue
    visited.add(current.file)
    if (current.depth > 1 && !direct.has(current.file)) transitive.add(current.file)
    if (current.depth >= maxDepth) continue
    for (const importer of reverseDependencies.get(current.file) ?? []) {
      queue.push({ file: importer, depth: current.depth + 1 })
    }
  }
}

function normalizeRepositoryPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '')
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort()
}

function riskForScore(score: number): RepositoryImpactRisk {
  if (score >= 75) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 25) return 'medium'
  return 'low'
}
