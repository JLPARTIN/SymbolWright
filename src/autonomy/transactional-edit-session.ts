import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type TransactionalEditSessionState =
  | 'planned'
  | 'applying'
  | 'applied'
  | 'rolled-back'
  | 'conflicted'
  | 'failed'

export interface TransactionalFileEdit {
  readonly path: string
  readonly content: string
  readonly expectedHash?: string | undefined
}

export interface TransactionalEditSessionRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly missionId: string
  readonly repositoryRoot: string
  readonly state: TransactionalEditSessionState
  readonly edits: readonly TransactionalFileEdit[]
  readonly appliedPaths: readonly string[]
  readonly conflicts: readonly string[]
  readonly error?: string | undefined
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt?: string | undefined
}

export interface TransactionalEditSessionStore {
  load(sessionId: string): Promise<TransactionalEditSessionRecord | undefined>
  save(record: TransactionalEditSessionRecord): Promise<void>
}

export class JsonTransactionalEditSessionStore implements TransactionalEditSessionStore {
  readonly #root: string

  constructor(workspaceRoot: string) {
    this.#root = path.resolve(workspaceRoot, '.symbolwright', 'autonomy', 'edit-sessions')
  }

  async load(sessionId: string): Promise<TransactionalEditSessionRecord | undefined> {
    try {
      const raw = await readFile(path.join(this.#root, `${validateId(sessionId)}.json`), 'utf8')
      return JSON.parse(raw) as TransactionalEditSessionRecord
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async save(record: TransactionalEditSessionRecord): Promise<void> {
    await mkdir(this.#root, { recursive: true })
    const destination = path.join(this.#root, `${validateId(record.id)}.json`)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, destination)
  }
}

export class TransactionalEditSession {
  readonly #store: TransactionalEditSessionStore

  constructor(store: TransactionalEditSessionStore) {
    this.#store = store
  }

  async create(input: {
    readonly missionId: string
    readonly repositoryRoot: string
    readonly edits: readonly TransactionalFileEdit[]
    readonly id?: string | undefined
    readonly now?: string | undefined
  }): Promise<TransactionalEditSessionRecord> {
    const now = input.now ?? new Date().toISOString()
    const repositoryRoot = path.resolve(input.repositoryRoot)
    const edits = normalizeEdits(repositoryRoot, input.edits)
    const record: TransactionalEditSessionRecord = {
      schemaVersion: 1,
      id: input.id ?? `edit-${randomUUID()}`,
      missionId: input.missionId,
      repositoryRoot,
      state: 'planned',
      edits,
      appliedPaths: [],
      conflicts: [],
      createdAt: now,
      updatedAt: now,
    }
    await this.#store.save(record)
    return record
  }

  async resume(sessionId: string): Promise<TransactionalEditSessionRecord> {
    const record = await this.#store.load(sessionId)
    if (!record) throw new Error(`Edit session ${sessionId} was not found.`)
    if (record.state === 'applied' || record.state === 'rolled-back') return record
    return this.apply(record)
  }

  async apply(record: TransactionalEditSessionRecord): Promise<TransactionalEditSessionRecord> {
    if (record.state === 'applied') return record
    const now = new Date().toISOString()
    const applying = { ...record, state: 'applying' as const, updatedAt: now }
    await this.#store.save(applying)

    const originals = new Map<string, Buffer | undefined>()
    const appliedPaths: string[] = []
    try {
      const conflicts = await findConflicts(applying)
      if (conflicts.length > 0) {
        const conflicted = {
          ...applying,
          state: 'conflicted' as const,
          conflicts,
          updatedAt: new Date().toISOString(),
        }
        await this.#store.save(conflicted)
        return conflicted
      }

      for (const edit of applying.edits) {
        const absolutePath = resolveRepositoryPath(applying.repositoryRoot, edit.path)
        originals.set(edit.path, await readOptional(absolutePath))
        await mkdir(path.dirname(absolutePath), { recursive: true })
        await atomicWrite(absolutePath, edit.content)
        appliedPaths.push(edit.path)
      }

      const completedAt = new Date().toISOString()
      const applied = {
        ...applying,
        state: 'applied' as const,
        appliedPaths,
        updatedAt: completedAt,
        completedAt,
      }
      await this.#store.save(applied)
      return applied
    } catch (error) {
      await rollbackFiles(applying.repositoryRoot, appliedPaths, originals)
      const failedAt = new Date().toISOString()
      const failed = {
        ...applying,
        state: 'rolled-back' as const,
        appliedPaths: [],
        error: errorMessage(error),
        updatedAt: failedAt,
        completedAt: failedAt,
      }
      await this.#store.save(failed)
      return failed
    }
  }
}

export function hashFileContent(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function normalizeEdits(
  repositoryRoot: string,
  edits: readonly TransactionalFileEdit[],
): readonly TransactionalFileEdit[] {
  if (edits.length === 0) throw new Error('An edit session requires at least one edit.')
  const seen = new Set<string>()
  return edits.map((edit) => {
    const normalizedPath = normalizeRelativePath(edit.path)
    resolveRepositoryPath(repositoryRoot, normalizedPath)
    if (seen.has(normalizedPath)) throw new Error(`Duplicate edit path: ${normalizedPath}`)
    seen.add(normalizedPath)
    return { ...edit, path: normalizedPath }
  })
}

async function findConflicts(record: TransactionalEditSessionRecord): Promise<string[]> {
  const conflicts: string[] = []
  for (const edit of record.edits) {
    if (edit.expectedHash === undefined) continue
    const current = await readOptional(resolveRepositoryPath(record.repositoryRoot, edit.path))
    const currentHash = current === undefined ? hashFileContent('') : hashFileContent(current)
    if (currentHash !== edit.expectedHash) conflicts.push(edit.path)
  }
  return conflicts
}

async function rollbackFiles(
  repositoryRoot: string,
  appliedPaths: readonly string[],
  originals: ReadonlyMap<string, Buffer | undefined>,
): Promise<void> {
  for (const relativePath of [...appliedPaths].reverse()) {
    const absolutePath = resolveRepositoryPath(repositoryRoot, relativePath)
    const original = originals.get(relativePath)
    if (original === undefined) await rm(absolutePath, { force: true })
    else await atomicWrite(absolutePath, original)
  }
}

async function atomicWrite(destination: string, content: string | Buffer): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`
  await writeFile(temporary, content)
  await rename(temporary, destination)
}

async function readOptional(filePath: string): Promise<Buffer | undefined> {
  try {
    const details = await stat(filePath)
    if (!details.isFile()) throw new Error(`Edit target is not a file: ${filePath}`)
    return await readFile(filePath)
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function normalizeRelativePath(value: string): string {
  if (value.includes('\0')) throw new Error('Edit paths may not contain null bytes.')
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '')
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized === '.git' ||
    normalized.startsWith('.git/') ||
    normalized === '.symbolwright' ||
    normalized.startsWith('.symbolwright/') ||
    normalized === '.symbolwright' ||
    normalized.startsWith('.symbolwright/')
  ) {
    throw new Error(`Unsafe edit path: ${value}`)
  }
  return normalized
}

function resolveRepositoryPath(repositoryRoot: string, relativePath: string): string {
  const absolutePath = path.resolve(repositoryRoot, relativePath)
  const prefix = `${repositoryRoot}${path.sep}`
  if (absolutePath !== repositoryRoot && !absolutePath.startsWith(prefix)) {
    throw new Error(`Edit path escapes repository root: ${relativePath}`)
  }
  return absolutePath
}

function validateId(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Invalid edit session ID: ${value}`)
  return value
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
