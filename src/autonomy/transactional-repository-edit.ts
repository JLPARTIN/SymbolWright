import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { runGitCommand, type GitCommandResult } from '../runtime/git/git-command-runner.js'
import type { SemanticEditPlan } from './semantic-edit-orchestrator.js'

export interface RepositoryEditFileSnapshot {
  readonly path: string
  readonly existed: boolean
  readonly contentBase64?: string
}

export interface RepositoryEditTransaction {
  readonly id: string
  readonly writePolicy: SemanticEditPlan['writePolicy']
  readonly allowedWrites: readonly string[]
  readonly baselineChangedFiles: readonly string[]
  readonly baselineSnapshots?: readonly RepositoryEditFileSnapshot[]
}

export interface RepositoryEditTransactionBeginOptions {
  readonly ownedBaselineFiles?: readonly string[]
}

export type RepositoryEditTransactionStart =
  | {
      readonly state: 'ready'
      readonly transaction: RepositoryEditTransaction
    }
  | {
      readonly state: 'blocked'
      readonly diagnostics: readonly string[]
      readonly conflictingFiles: readonly string[]
    }

export interface RepositoryEditTransactionInspection {
  readonly modifiedFiles: readonly string[]
  readonly unexpectedFiles: readonly string[]
}

export interface RepositoryEditTransactionManager {
  begin(
    plan: SemanticEditPlan,
    options?: RepositoryEditTransactionBeginOptions,
  ): Promise<RepositoryEditTransactionStart>
  inspect(transaction: RepositoryEditTransaction): Promise<RepositoryEditTransactionInspection>
  commit(transaction: RepositoryEditTransaction): Promise<void>
  rollback(
    transaction: RepositoryEditTransaction,
    files?: readonly string[],
  ): Promise<readonly string[]>
}

export interface TransactionalRepositoryEditOptions {
  readonly repositoryRoot: string
  readonly readChangedFiles?: () => Promise<readonly string[]>
  readonly runGit?: (
    args: readonly string[],
    cwd: string,
    timeoutMs?: number,
  ) => Promise<GitCommandResult>
  readonly readPath?: (filePath: string) => Promise<Buffer>
  readonly writePath?: (filePath: string, content: Buffer) => Promise<void>
  readonly removePath?: (filePath: string) => Promise<void>
}

/**
 * Protects autonomous edit sessions from overwriting an operator's existing
 * work and can roll back only the paths introduced by the current task.
 * Nested repair transactions may explicitly snapshot mission-owned baseline
 * changes so a failed repair restores the pre-repair content rather than HEAD.
 */
export class TransactionalRepositoryEdit implements RepositoryEditTransactionManager {
  readonly #repositoryRoot: string
  readonly #readChangedFiles: () => Promise<readonly string[]>
  readonly #runGit: NonNullable<TransactionalRepositoryEditOptions['runGit']>
  readonly #readPath: NonNullable<TransactionalRepositoryEditOptions['readPath']>
  readonly #writePath: NonNullable<TransactionalRepositoryEditOptions['writePath']>
  readonly #removePath: NonNullable<TransactionalRepositoryEditOptions['removePath']>

  constructor(options: TransactionalRepositoryEditOptions) {
    this.#repositoryRoot = path.resolve(options.repositoryRoot)
    this.#runGit = options.runGit ?? runGitCommand
    this.#readChangedFiles =
      options.readChangedFiles ?? (() => readGitChangedFiles(this.#repositoryRoot, this.#runGit))
    this.#readPath = options.readPath ?? ((filePath) => readFile(filePath))
    this.#writePath =
      options.writePath ??
      (async (filePath, content) => {
        await mkdir(path.dirname(filePath), { recursive: true })
        await writeFile(filePath, content)
      })
    this.#removePath =
      options.removePath ??
      (async (filePath) => {
        await rm(path.resolve(this.#repositoryRoot, filePath), { force: true, recursive: true })
      })
  }

  async begin(
    plan: SemanticEditPlan,
    options: RepositoryEditTransactionBeginOptions = {},
  ): Promise<RepositoryEditTransactionStart> {
    const baselineChangedFiles = normalizePaths(await this.#readChangedFiles())
    const baselineSet = new Set(baselineChangedFiles)
    const ownedBaseline = new Set(normalizePaths(options.ownedBaselineFiles ?? []))
    const conflictingFiles = plan.allowedWrites
      .filter((file) => baselineSet.has(file) && !ownedBaseline.has(file))
      .sort()

    if (conflictingFiles.length > 0) {
      return {
        state: 'blocked',
        conflictingFiles,
        diagnostics: [
          'The autonomous edit scope contains pre-existing repository changes.',
          `Commit, stash, or remove operator changes before editing: ${conflictingFiles.join(', ')}`,
        ],
      }
    }

    const snapshotPaths = plan.allowedWrites.filter(
      (file) => baselineSet.has(file) && ownedBaseline.has(file),
    )
    const baselineSnapshots = await Promise.all(
      snapshotPaths.map((file) => this.#captureSnapshot(file)),
    )

    return {
      state: 'ready',
      transaction: {
        id: randomUUID(),
        writePolicy: plan.writePolicy,
        allowedWrites: normalizePaths(plan.allowedWrites),
        baselineChangedFiles,
        ...(baselineSnapshots.length === 0 ? {} : { baselineSnapshots }),
      },
    }
  }

  async inspect(
    transaction: RepositoryEditTransaction,
  ): Promise<RepositoryEditTransactionInspection> {
    const baseline = new Set(transaction.baselineChangedFiles)
    const currentChangedFiles = normalizePaths(await this.#readChangedFiles())
    const introduced = currentChangedFiles.filter((file) => !baseline.has(file))
    const changedSnapshots: string[] = []
    for (const snapshot of transaction.baselineSnapshots ?? []) {
      if (!(await this.#matchesSnapshot(snapshot))) changedSnapshots.push(snapshot.path)
    }
    const modifiedFiles = normalizePaths([...introduced, ...changedSnapshots])
    const allowed = new Set(transaction.allowedWrites)
    const unexpectedFiles =
      transaction.writePolicy === 'discovery'
        ? []
        : modifiedFiles.filter((file) => !allowed.has(file)).sort()

    return { modifiedFiles, unexpectedFiles }
  }

  async commit(_transaction: RepositoryEditTransaction): Promise<void> {
    // A transaction commits by leaving the verified working-tree changes in place.
  }

  async rollback(
    transaction: RepositoryEditTransaction,
    files?: readonly string[],
  ): Promise<readonly string[]> {
    const inspection = await this.inspect(transaction)
    const introduced = new Set(inspection.modifiedFiles)
    const rollbackPaths = normalizePaths(files ?? inspection.modifiedFiles).filter((file) =>
      introduced.has(file),
    )
    const snapshots = new Map(
      (transaction.baselineSnapshots ?? []).map((snapshot) => [snapshot.path, snapshot]),
    )
    const restored: string[] = []

    for (const file of rollbackPaths) {
      const snapshot = snapshots.get(file)
      if (snapshot !== undefined) {
        await this.#restoreSnapshot(snapshot)
        restored.push(file)
        continue
      }

      const tracked = await this.#runGit(
        ['ls-files', '--error-unmatch', '--', file],
        this.#repositoryRoot,
      )
      if (tracked.exitCode === 0) {
        const result = await this.#runGit(
          ['restore', '--staged', '--worktree', '--', file],
          this.#repositoryRoot,
        )
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || `Could not restore ${file}.`)
        }
      } else {
        await this.#removePath(file)
      }
      restored.push(file)
    }

    return restored.sort()
  }

  async #captureSnapshot(file: string): Promise<RepositoryEditFileSnapshot> {
    try {
      const content = await this.#readPath(path.resolve(this.#repositoryRoot, file))
      return { path: file, existed: true, contentBase64: content.toString('base64') }
    } catch (error) {
      if (isMissing(error)) return { path: file, existed: false }
      throw error
    }
  }

  async #matchesSnapshot(snapshot: RepositoryEditFileSnapshot): Promise<boolean> {
    try {
      const content = await this.#readPath(path.resolve(this.#repositoryRoot, snapshot.path))
      return snapshot.existed && content.toString('base64') === snapshot.contentBase64
    } catch (error) {
      if (isMissing(error)) return !snapshot.existed
      throw error
    }
  }

  async #restoreSnapshot(snapshot: RepositoryEditFileSnapshot): Promise<void> {
    const destination = path.resolve(this.#repositoryRoot, snapshot.path)
    if (!snapshot.existed) {
      await this.#removePath(snapshot.path)
      return
    }
    if (snapshot.contentBase64 === undefined) {
      throw new Error(`Missing baseline content for ${snapshot.path}.`)
    }
    await this.#writePath(destination, Buffer.from(snapshot.contentBase64, 'base64'))
  }
}

async function readGitChangedFiles(
  repositoryRoot: string,
  runGit: NonNullable<TransactionalRepositoryEditOptions['runGit']>,
): Promise<readonly string[]> {
  const result = await runGit(['status', '--porcelain=v1'], repositoryRoot)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'Could not inspect repository changes.')
  }
  return parseGitStatusPaths(result.stdout)
}

export function parseGitStatusPaths(output: string): readonly string[] {
  return normalizePaths(
    output
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length >= 4)
      .map((line) => {
        const rawPath = line.slice(3)
        const renameSeparator = ' -> '
        const renameIndex = rawPath.lastIndexOf(renameSeparator)
        return renameIndex === -1 ? rawPath : rawPath.slice(renameIndex + renameSeparator.length)
      }),
  )
}

function normalizePaths(values: readonly string[]): readonly string[] {
  return [
    ...new Set(values.map(normalizePath).filter((value) => isSafeRepositoryPath(value))),
  ].sort()
}

function normalizePath(value: string): string {
  return path.posix.normalize(value.replaceAll('\\', '/').replace(/^\.\//, ''))
}

function isSafeRepositoryPath(value: string): boolean {
  return (
    value.length > 0 && value !== '.' && !path.posix.isAbsolute(value) && !value.startsWith('../')
  )
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
