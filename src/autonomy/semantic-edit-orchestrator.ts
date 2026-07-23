import path from 'node:path'

import { analyzeRepositoryImpact } from './repository-impact-analysis.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'
import type { AutonomousTaskNode } from './task-graph.types.js'

export type SemanticWritePolicy = 'declared' | 'discovery'

export interface SemanticEditStep {
  readonly filePath: string
  readonly order: number
  readonly packageOwner?: string | undefined
  readonly exportedSymbols: readonly string[]
  readonly importsWithinPlan: readonly string[]
  readonly importedByWithinPlan: readonly string[]
}

export interface SemanticToolPhase {
  readonly id: 'inspect' | 'edit' | 'verify'
  readonly parallel: boolean
  readonly files: readonly string[]
  readonly commands: readonly string[]
  readonly purpose: string
}

export interface SemanticEditPlan {
  readonly schemaVersion: 1
  readonly taskId: string
  readonly objective: string
  readonly writePolicy: SemanticWritePolicy
  readonly declaredWrites: readonly string[]
  readonly allowedWrites: readonly string[]
  readonly orderedWrites: readonly string[]
  readonly affectedImporters: readonly string[]
  readonly affectedPackages: readonly string[]
  readonly exportedSymbols: readonly string[]
  readonly validationCommands: readonly string[]
  readonly steps: readonly SemanticEditStep[]
  readonly phases: readonly SemanticToolPhase[]
  readonly rationale: readonly string[]
}

export function planSemanticMultiFileEdit(input: {
  readonly task: AutonomousTaskNode
  readonly index?: RepositorySemanticIndexSnapshot | undefined
  readonly validationCommands?: readonly string[] | undefined
}): SemanticEditPlan {
  const declaredWrites = concretePaths(input.task.resources.writes)
  const writePolicy: SemanticWritePolicy = declaredWrites.length === 0 ? 'discovery' : 'declared'
  const validationCommands = uniqueSorted(input.validationCommands ?? [])

  if (input.index === undefined) {
    const orderedWrites = [...declaredWrites]
    return buildPlan({
      task: input.task,
      writePolicy,
      declaredWrites,
      allowedWrites: orderedWrites,
      orderedWrites,
      affectedImporters: [],
      affectedPackages: [],
      exportedSymbols: [],
      validationCommands,
      steps: orderedWrites.map((filePath, order) => ({
        filePath,
        order,
        exportedSymbols: [],
        importsWithinPlan: [],
        importedByWithinPlan: [],
      })),
      rationale: [
        'No persisted semantic index was available; declared write scope remains authoritative.',
      ],
    })
  }

  const suggestedWrites =
    declaredWrites.length === 0 ? objectiveMatchedFiles(input.task.objective, input.index) : []
  const impactRoots = uniqueSorted([...declaredWrites, ...suggestedWrites])
  const impact = analyzeRepositoryImpact(input.index, impactRoots, {
    validationCommands,
  })
  const affectedImporters = uniqueSorted([
    ...impact.directlyAffectedFiles,
    ...impact.transitivelyAffectedFiles,
  ])
  const allowedWrites = uniqueSorted([...impactRoots, ...affectedImporters])
  const orderedWrites = dependencyOrder(input.index, allowedWrites)
  const allowedSet = new Set(allowedWrites)
  const importEdges = resolvedImportEdges(input.index)
  const fileRecords = new Map(input.index.files.map((file) => [normalizePath(file.path), file]))
  const symbolsByFile = new Map<string, string[]>()

  for (const symbol of input.index.symbols) {
    if (!symbol.exported) continue
    const filePath = normalizePath(symbol.filePath)
    const symbols = symbolsByFile.get(filePath) ?? []
    symbols.push(symbol.name)
    symbolsByFile.set(filePath, symbols)
  }

  const steps = orderedWrites.map((filePath, order): SemanticEditStep => {
    const importsWithinPlan = importEdges
      .filter((edge) => edge.importer === filePath && allowedSet.has(edge.imported))
      .map((edge) => edge.imported)
    const importedByWithinPlan = importEdges
      .filter((edge) => edge.imported === filePath && allowedSet.has(edge.importer))
      .map((edge) => edge.importer)
    return {
      filePath,
      order,
      packageOwner: fileRecords.get(filePath)?.packageOwner,
      exportedSymbols: uniqueSorted(symbolsByFile.get(filePath) ?? []),
      importsWithinPlan: uniqueSorted(importsWithinPlan),
      importedByWithinPlan: uniqueSorted(importedByWithinPlan),
    }
  })

  const rationale = [
    `Prepared ${orderedWrites.length} dependency-ordered files for semantic editing.`,
    `Expanded ${impactRoots.length} impact roots to ${affectedImporters.length} known importers.`,
    `Repository impact is ${impact.risk} (${impact.riskScore}/100).`,
    ...impact.reasons,
  ]

  return buildPlan({
    task: input.task,
    writePolicy,
    declaredWrites,
    allowedWrites,
    orderedWrites,
    affectedImporters,
    affectedPackages: impact.affectedPackages,
    exportedSymbols: impact.affectedExportedSymbols,
    validationCommands: impact.validationCommands,
    steps,
    rationale,
  })
}

function buildPlan(input: {
  readonly task: AutonomousTaskNode
  readonly writePolicy: SemanticWritePolicy
  readonly declaredWrites: readonly string[]
  readonly allowedWrites: readonly string[]
  readonly orderedWrites: readonly string[]
  readonly affectedImporters: readonly string[]
  readonly affectedPackages: readonly string[]
  readonly exportedSymbols: readonly string[]
  readonly validationCommands: readonly string[]
  readonly steps: readonly SemanticEditStep[]
  readonly rationale: readonly string[]
}): SemanticEditPlan {
  return {
    schemaVersion: 1,
    taskId: input.task.id,
    objective: input.task.objective,
    writePolicy: input.writePolicy,
    declaredWrites: uniqueSorted(input.declaredWrites),
    allowedWrites: uniqueSorted(input.allowedWrites),
    orderedWrites: [...input.orderedWrites],
    affectedImporters: uniqueSorted(input.affectedImporters),
    affectedPackages: uniqueSorted(input.affectedPackages),
    exportedSymbols: uniqueSorted(input.exportedSymbols),
    validationCommands: uniqueSorted(input.validationCommands),
    steps: input.steps,
    phases: [
      {
        id: 'inspect',
        parallel: true,
        files: uniqueSorted(input.allowedWrites),
        commands: [],
        purpose: 'Inspect definitions, references, package boundaries, and existing tests before editing.',
      },
      {
        id: 'edit',
        parallel: false,
        files: [...input.orderedWrites],
        commands: [],
        purpose: 'Edit dependency providers before their importers and preserve repository contracts.',
      },
      {
        id: 'verify',
        parallel: false,
        files: uniqueSorted(input.allowedWrites),
        commands: uniqueSorted(input.validationCommands),
        purpose: 'Review the final diff and run impact-guided validation commands.',
      },
    ],
    rationale: unique(input.rationale),
  }
}

function objectiveMatchedFiles(
  objective: string,
  index: RepositorySemanticIndexSnapshot,
): readonly string[] {
  const terms = objective
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .filter((term) => term.length >= 3)
  if (terms.length === 0) return []

  return uniqueSorted(
    index.symbols
      .filter((symbol) => terms.some((term) => symbol.name.toLowerCase().includes(term)))
      .map((symbol) => normalizePath(symbol.filePath)),
  )
}

function dependencyOrder(
  index: RepositorySemanticIndexSnapshot,
  files: readonly string[],
): readonly string[] {
  const candidates = new Set(files.map(normalizePath))
  const outgoing = new Map<string, Set<string>>()
  const indegree = new Map<string, number>()

  for (const file of candidates) {
    outgoing.set(file, new Set())
    indegree.set(file, 0)
  }

  for (const edge of resolvedImportEdges(index)) {
    if (!candidates.has(edge.imported) || !candidates.has(edge.importer)) continue
    const dependants = outgoing.get(edge.imported)
    if (dependants === undefined || dependants.has(edge.importer)) continue
    dependants.add(edge.importer)
    indegree.set(edge.importer, (indegree.get(edge.importer) ?? 0) + 1)
  }

  const ready = [...candidates].filter((file) => indegree.get(file) === 0).sort()
  const ordered: string[] = []
  while (ready.length > 0) {
    const current = ready.shift()
    if (current === undefined) break
    ordered.push(current)
    for (const dependant of [...(outgoing.get(current) ?? [])].sort()) {
      const remaining = (indegree.get(dependant) ?? 0) - 1
      indegree.set(dependant, remaining)
      if (remaining === 0) insertSorted(ready, dependant)
    }
  }

  if (ordered.length === candidates.size) return ordered
  const unresolved = [...candidates].filter((file) => !ordered.includes(file)).sort()
  return [...ordered, ...unresolved]
}

function resolvedImportEdges(
  index: RepositorySemanticIndexSnapshot,
): readonly { importer: string; imported: string }[] {
  const knownFiles = new Set(index.files.map((file) => normalizePath(file.path)))
  const edges: { importer: string; imported: string }[] = []
  for (const record of index.imports) {
    const imported = resolveImport(index.repositoryRoot, record.filePath, record.source, knownFiles)
    if (imported === undefined) continue
    edges.push({ importer: normalizePath(record.filePath), imported })
  }
  return edges
}

function resolveImport(
  repositoryRoot: string,
  importerPath: string,
  source: string,
  knownFiles: ReadonlySet<string>,
): string | undefined {
  if (!source.startsWith('.')) return undefined
  const importerDirectory = path.posix.dirname(normalizePath(importerPath))
  const base = normalizePath(path.posix.join(importerDirectory, source))
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ]

  if (base.endsWith('.js')) candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`)
  if (base.endsWith('.jsx')) candidates.push(`${base.slice(0, -4)}.tsx`)

  const repositoryPrefix = normalizePath(repositoryRoot)
  for (const candidate of candidates) {
    const normalized = normalizePath(candidate)
    const relative = normalized.startsWith(`${repositoryPrefix}/`)
      ? normalized.slice(repositoryPrefix.length + 1)
      : normalized
    if (knownFiles.has(relative)) return relative
  }
  return undefined
}

function concretePaths(paths: readonly string[]): readonly string[] {
  return uniqueSorted(
    paths
      .filter((value) => !/[?*{}[\]]/.test(value))
      .map(normalizePath)
      .filter((value) => value.length > 0 && value !== '.' && !value.startsWith('../')),
  )
}

function normalizePath(value: string): string {
  return path.posix.normalize(value.replaceAll('\\', '/').replace(/^\.\//, ''))
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort()
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function insertSorted(values: string[], value: string): void {
  if (values.includes(value)) return
  const index = values.findIndex((entry) => entry.localeCompare(value) > 0)
  if (index === -1) values.push(value)
  else values.splice(index, 0, value)
}
