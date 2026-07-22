import { createHash } from 'node:crypto'
import { relative } from 'node:path'

import type {
  RepositoryFileRecord,
  RepositoryImportRecord,
  RepositoryIndexQueryResult,
  RepositoryReferenceRecord,
  RepositorySemanticIndexSnapshot,
  RepositorySymbolKind,
  RepositorySymbolRecord,
} from './repository-semantic-index.types.js'

export interface RepositoryIndexSourceFile {
  readonly absolutePath: string
  readonly content: string
  readonly packageOwner?: string | undefined
  readonly generated?: boolean | undefined
}

const SYMBOL_PATTERN =
  /^\s*(export\s+)?(?:default\s+)?(?:async\s+)?(class|interface|type|function|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm
const IMPORT_PATTERN = /^\s*import\s+(.*?)\s+from\s+['"]([^'"]+)['"]/gm

export function buildRepositorySemanticIndex(
  repositoryRoot: string,
  files: readonly RepositoryIndexSourceFile[],
  now = new Date().toISOString(),
): RepositorySemanticIndexSnapshot {
  const fileRecords: RepositoryFileRecord[] = []
  const symbols: RepositorySymbolRecord[] = []
  const imports: RepositoryImportRecord[] = []

  for (const sourceFile of files) {
    const filePath = normalizePath(relative(repositoryRoot, sourceFile.absolutePath))
    const language = detectLanguage(filePath)
    fileRecords.push({
      path: filePath,
      language,
      contentHash: createHash('sha256').update(sourceFile.content).digest('hex'),
      generated: sourceFile.generated ?? isGeneratedPath(filePath),
      packageOwner: sourceFile.packageOwner,
      indexedAt: now,
    })

    if (language === 'typescript' || language === 'javascript') {
      symbols.push(...extractSymbols(filePath, sourceFile.content))
      imports.push(...extractImports(filePath, sourceFile.content))
    }
  }

  const symbolNames = new Set(symbols.map((symbol) => symbol.name))
  const references = files.flatMap((file) => {
    const filePath = normalizePath(relative(repositoryRoot, file.absolutePath))
    return extractReferences(filePath, file.content, symbolNames)
  })

  return {
    schemaVersion: 1,
    repositoryRoot,
    createdAt: now,
    updatedAt: now,
    files: fileRecords,
    symbols,
    imports,
    references,
  }
}

export function queryRepositoryIndex(
  index: RepositorySemanticIndexSnapshot,
  symbolName: string,
): RepositoryIndexQueryResult {
  const definitions = index.symbols.filter((symbol) => symbol.name === symbolName)
  const references = index.references.filter((reference) => reference.symbolName === symbolName)
  const definingPaths = new Set(definitions.map((definition) => definition.filePath))
  const importers = index.imports
    .filter((entry) => entry.names.includes(symbolName) || definingPaths.has(resolveImportHint(entry.source)))
    .map((entry) => entry.filePath)

  return { definitions, references, importers: [...new Set(importers)] }
}

function extractSymbols(filePath: string, content: string): RepositorySymbolRecord[] {
  return [...content.matchAll(SYMBOL_PATTERN)].map((match) => ({
    id: `${filePath}:${match.index ?? 0}:${match[3]}`,
    name: match[3] ?? '',
    kind: normalizeSymbolKind(match[2] ?? 'variable'),
    filePath,
    line: lineAt(content, match.index ?? 0),
    exported: Boolean(match[1]),
  }))
}

function extractImports(filePath: string, content: string): RepositoryImportRecord[] {
  return [...content.matchAll(IMPORT_PATTERN)].map((match) => ({
    filePath,
    source: match[2] ?? '',
    names: parseImportNames(match[1] ?? ''),
  }))
}

function extractReferences(
  filePath: string,
  content: string,
  symbolNames: ReadonlySet<string>,
): RepositoryReferenceRecord[] {
  const references: RepositoryReferenceRecord[] = []
  for (const symbolName of symbolNames) {
    const pattern = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g')
    for (const match of content.matchAll(pattern)) {
      references.push({ symbolName, filePath, line: lineAt(content, match.index ?? 0) })
    }
  }
  return references
}

function parseImportNames(clause: string): string[] {
  return clause
    .replace(/[{}]/g, '')
    .split(',')
    .map((name) => name.trim().split(/\s+as\s+/)[0] ?? '')
    .filter(Boolean)
}

function normalizeSymbolKind(value: string): RepositorySymbolKind {
  return value === 'const' || value === 'let' || value === 'var' ? 'variable' : (value as RepositorySymbolKind)
}

function detectLanguage(filePath: string): string {
  if (/\.(ts|tsx|mts|cts)$/.test(filePath)) return 'typescript'
  if (/\.(js|jsx|mjs|cjs)$/.test(filePath)) return 'javascript'
  if (/\.py$/.test(filePath)) return 'python'
  if (/\.go$/.test(filePath)) return 'go'
  return 'unknown'
}

function isGeneratedPath(filePath: string): boolean {
  return /(^|\/)(dist|build|coverage|generated|vendor)(\/|$)/.test(filePath)
}

function lineAt(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/')
}

function resolveImportHint(source: string): string {
  return source.replace(/^\.\//, '').replace(/\.js$/, '.ts')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
