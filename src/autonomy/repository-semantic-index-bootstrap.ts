import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import {
  buildRepositorySemanticIndex,
  type RepositoryIndexSourceFile,
} from './repository-semantic-index.js'
import { RepositorySemanticIndexStore } from './repository-semantic-index-store.js'
import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

const DEFAULT_MAX_FILE_BYTES = 1_000_000
const IGNORED_DIRECTORIES = new Set([
  '.codemind',
  '.git',
  '.hg',
  '.svn',
  '.idea',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'vendor',
])
const IGNORED_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])
const INDEXABLE_EXTENSIONS = new Set([
  '.bash',
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.css',
  '.cts',
  '.dart',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.jsx',
  '.json',
  '.kt',
  '.kts',
  '.md',
  '.mjs',
  '.mts',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scala',
  '.sh',
  '.sql',
  '.swift',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
  '.zsh',
])

export interface RepositorySemanticIndexBootstrapOptions {
  readonly workspaceRoot: string
  readonly repositoryRoot: string
  readonly force?: boolean
  readonly maxFileBytes?: number
  readonly now?: () => Date
  readonly store?: RepositorySemanticIndexStore
}

export async function ensureRepositorySemanticIndex(
  options: RepositorySemanticIndexBootstrapOptions,
): Promise<RepositorySemanticIndexSnapshot> {
  const repositoryRoot = path.resolve(options.repositoryRoot)
  const store =
    options.store ??
    new RepositorySemanticIndexStore(path.join(path.resolve(options.workspaceRoot), '.codemind'))
  if (options.force !== true) {
    const existing = await store.load(repositoryRoot)
    if (existing !== undefined) return existing
  }

  const files = await collectRepositoryIndexSourceFiles(repositoryRoot, {
    ...(options.maxFileBytes === undefined ? {} : { maxFileBytes: options.maxFileBytes }),
  })
  if (files.length === 0) {
    throw new Error(`No indexable repository files were found: ${repositoryRoot}`)
  }
  const index = buildRepositorySemanticIndex(
    repositoryRoot,
    files,
    (options.now ?? (() => new Date()))().toISOString(),
  )
  await store.save(repositoryRoot, index)
  return index
}

export async function collectRepositoryIndexSourceFiles(
  repositoryRoot: string,
  options: { readonly maxFileBytes?: number } = {},
): Promise<readonly RepositoryIndexSourceFile[]> {
  const root = path.resolve(repositoryRoot)
  const rootStats = await stat(root)
  if (!rootStats.isDirectory()) throw new Error(`Repository root is not a directory: ${root}`)
  const files: RepositoryIndexSourceFile[] = []
  await walk(root, undefined, files, options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES)
  return files.sort((left, right) => left.absolutePath.localeCompare(right.absolutePath))
}

async function walk(
  directory: string,
  inheritedPackageOwner: string | undefined,
  files: RepositoryIndexSourceFile[],
  maxFileBytes: number,
): Promise<void> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  )
  const packageOwner = (await readPackageOwner(directory)) ?? inheritedPackageOwner
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue
      await walk(absolutePath, packageOwner, files, maxFileBytes)
      continue
    }
    if (!entry.isFile() || !isIndexableFile(entry.name)) continue
    const fileStats = await stat(absolutePath)
    if (fileStats.size > maxFileBytes) continue
    const content = await readFile(absolutePath, 'utf8')
    if (content.includes('\u0000')) continue
    files.push({
      absolutePath,
      content,
      ...(packageOwner === undefined ? {} : { packageOwner }),
    })
  }
}

async function readPackageOwner(directory: string): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as {
      name?: unknown
    }
    return typeof parsed.name === 'string' && parsed.name.trim().length > 0
      ? parsed.name.trim()
      : undefined
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return undefined
    throw error
  }
}

function isIndexableFile(fileName: string): boolean {
  if (IGNORED_FILES.has(fileName)) return false
  return INDEXABLE_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
