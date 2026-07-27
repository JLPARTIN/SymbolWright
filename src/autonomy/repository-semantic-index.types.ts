export type RepositorySymbolKind =
  'class' | 'interface' | 'type' | 'function' | 'method' | 'variable' | 'enum'

export interface RepositorySymbolRecord {
  readonly id: string
  readonly name: string
  readonly kind: RepositorySymbolKind
  readonly filePath: string
  readonly line: number
  readonly exported: boolean
}

export interface RepositoryImportRecord {
  readonly filePath: string
  readonly source: string
  readonly names: readonly string[]
}

export interface RepositoryReferenceRecord {
  readonly symbolName: string
  readonly filePath: string
  readonly line: number
}

export interface RepositoryFileRecord {
  readonly path: string
  readonly language: string
  readonly contentHash: string
  readonly generated: boolean
  readonly packageOwner?: string | undefined
  readonly indexedAt: string
}

export interface RepositorySemanticIndexSnapshot {
  readonly schemaVersion: 1
  readonly repositoryRoot: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly files: readonly RepositoryFileRecord[]
  readonly symbols: readonly RepositorySymbolRecord[]
  readonly imports: readonly RepositoryImportRecord[]
  readonly references: readonly RepositoryReferenceRecord[]
}

export interface RepositoryIndexQueryResult {
  readonly definitions: readonly RepositorySymbolRecord[]
  readonly references: readonly RepositoryReferenceRecord[]
  readonly importers: readonly string[]
}
