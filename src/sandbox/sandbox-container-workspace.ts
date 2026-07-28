import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type {
  SandboxArtifactReference,
  SandboxExecutionRequest,
  SandboxLimits,
} from './sandbox-types.js'

const EXCLUDED_DIRECTORY_NAMES = new Set(['.git', '.symbolwright', '.codemind', 'node_modules'])
const TEXT_PATCH_MAX_FILE_BYTES = 512 * 1024

export class SandboxWorkspaceBoundaryError extends Error {}

export interface MaterializedSandboxWorkspace {
  readonly workRoot: string
  readonly inputDir: string
  readonly outputDir: string
  readonly artifactDir: string
  readonly entrypoint: string
  readonly inputManifest: ReadonlyMap<string, WorkspaceManifestEntry>
}

export interface WorkspaceManifestEntry {
  readonly path: string
  readonly sizeBytes: number
  readonly sha256: string
}

export interface SandboxArtifactQuarantineResult {
  readonly artifacts: readonly SandboxArtifactReference[]
  readonly changedPaths: readonly string[]
  readonly removedPaths: readonly string[]
  readonly warnings: readonly string[]
}

interface CopyBudget {
  files: number
  bytes: number
}

export async function materializeSandboxContainerWorkspace(options: {
  readonly executionId: string
  readonly request: SandboxExecutionRequest
  readonly limits: SandboxLimits
  readonly stateRoot?: string
}): Promise<MaterializedSandboxWorkspace> {
  const stateRoot = path.resolve(
    options.stateRoot ?? path.join(os.tmpdir(), 'symbolwright-strong-sandbox'),
  )
  const workParent = path.join(stateRoot, 'work')
  const artifactDir = path.join(stateRoot, 'artifacts', options.executionId)
  await mkdir(workParent, { recursive: true, mode: 0o700 })
  await rm(artifactDir, { recursive: true, force: true })
  await mkdir(artifactDir, { recursive: true, mode: 0o700 })

  const workRoot = await mkdtemp(path.join(workParent, `${safeExecutionId(options.executionId)}-`))
  const inputDir = path.join(workRoot, 'input')
  const outputDir = path.join(workRoot, 'output')
  await mkdir(inputDir, { recursive: true, mode: 0o777 })
  await mkdir(outputDir, { recursive: true, mode: 0o777 })

  try {
    const budget: CopyBudget = { files: 0, bytes: 0 }
    if (options.request.source !== undefined) {
      const fileName = defaultSourceFileName(options.request.languageId)
      await writeBoundedFile(
        inputDir,
        fileName,
        Buffer.from(options.request.source, 'utf8'),
        options.limits,
        budget,
      )
    } else if (options.request.files !== undefined) {
      for (const file of options.request.files) {
        await writeBoundedFile(
          inputDir,
          file.path,
          Buffer.from(file.content, 'utf8'),
          options.limits,
          budget,
        )
      }
    } else if (options.request.repository !== undefined) {
      await copyRepositorySnapshot(
        options.request.repository.rootPath,
        options.request.repository.selectedPaths,
        inputDir,
        options.limits,
        budget,
      )
    } else {
      throw new SandboxWorkspaceBoundaryError('A validated sandbox request had no source mode.')
    }

    await makeTreeContainerWritable(inputDir)
    const inputManifest = await manifestDirectory(inputDir, {
      maxFiles: options.limits.maxFiles,
      maxBytes: options.limits.maxTotalSourceBytes,
    })
    const entrypoint = chooseEntrypoint(options.request, inputManifest)
    return { workRoot, inputDir, outputDir, artifactDir, entrypoint, inputManifest }
  } catch (error) {
    await rm(workRoot, { recursive: true, force: true })
    throw error
  }
}

export async function quarantineSandboxContainerArtifacts(options: {
  readonly executionId: string
  readonly workspace: MaterializedSandboxWorkspace
  readonly limits: SandboxLimits
}): Promise<SandboxArtifactQuarantineResult> {
  const outputManifest = await manifestDirectory(options.workspace.outputDir, {
    maxFiles: options.limits.maxFiles,
    maxBytes: options.limits.maxTotalSourceBytes + options.limits.maxArtifactBytes,
  })
  const changedPaths = [...outputManifest.keys()]
    .filter((filePath) => {
      const before = options.workspace.inputManifest.get(filePath)
      const after = outputManifest.get(filePath)
      return before === undefined || before.sha256 !== after?.sha256
    })
    .sort()
  const removedPaths = [...options.workspace.inputManifest.keys()]
    .filter((filePath) => !outputManifest.has(filePath))
    .sort()

  const artifacts: SandboxArtifactReference[] = []
  const warnings: string[] = []
  let totalArtifactBytes = 0

  for (const relativePath of changedPaths) {
    const manifest = outputManifest.get(relativePath)
    if (manifest === undefined) continue
    if (manifest.sizeBytes > options.limits.maxFileBytes) {
      throw new SandboxWorkspaceBoundaryError(
        `Generated file exceeds maxFileBytes: ${relativePath}.`,
      )
    }
    totalArtifactBytes += manifest.sizeBytes
    if (totalArtifactBytes > options.limits.maxArtifactBytes) {
      throw new SandboxWorkspaceBoundaryError('Generated artifacts exceed maxArtifactBytes.')
    }
    const sourcePath = safeJoin(options.workspace.outputDir, relativePath)
    const artifactPath = safeJoin(
      options.workspace.artifactDir,
      path.posix.join('files', relativePath),
    )
    const content = await readFile(sourcePath)
    await mkdir(path.dirname(artifactPath), { recursive: true, mode: 0o700 })
    await writeFile(artifactPath, content, { mode: 0o600 })
    artifacts.push(
      artifactReference(
        options.executionId,
        path.posix.join('files', relativePath),
        content,
        mimeTypeForPath(relativePath),
      ),
    )
  }

  if (changedPaths.length > 0 || removedPaths.length > 0) {
    const manifestContent = Buffer.from(
      `${JSON.stringify({ schemaVersion: 1, changedPaths, removedPaths }, null, 2)}\n`,
      'utf8',
    )
    totalArtifactBytes += manifestContent.byteLength
    if (totalArtifactBytes <= options.limits.maxArtifactBytes) {
      const manifestPath = path.join(options.workspace.artifactDir, 'changes.json')
      await writeFile(manifestPath, manifestContent, { mode: 0o600 })
      artifacts.push(
        artifactReference(options.executionId, 'changes.json', manifestContent, 'application/json'),
      )
    } else {
      warnings.push('Artifact manifest omitted because maxArtifactBytes was exhausted.')
    }

    const patch = buildBoundedPatch(
      options.workspace.inputDir,
      options.workspace.outputDir,
      options.limits.maxArtifactBytes - totalArtifactBytes,
    )
    if (patch.warning !== undefined) warnings.push(patch.warning)
    if (patch.content !== undefined) {
      const patchPath = path.join(options.workspace.artifactDir, 'changes.patch')
      await writeFile(patchPath, patch.content, { mode: 0o600 })
      artifacts.push(
        artifactReference(options.executionId, 'changes.patch', patch.content, 'text/x-diff'),
      )
    }
  }

  return { artifacts, changedPaths, removedPaths, warnings }
}

export async function cleanupSandboxContainerWorkspace(
  workspace: MaterializedSandboxWorkspace,
): Promise<void> {
  await rm(workspace.workRoot, { recursive: true, force: true })
}

async function copyRepositorySnapshot(
  rootPath: string,
  selectedPaths: readonly string[] | undefined,
  destinationRoot: string,
  limits: SandboxLimits,
  budget: CopyBudget,
): Promise<void> {
  const canonicalRoot = await realpath(path.resolve(rootPath))
  const selection =
    selectedPaths === undefined || selectedPaths.length === 0 ? ['.'] : selectedPaths
  for (const selectedPath of selection) {
    const normalized = normalizeRelativePath(selectedPath)
    await copyRepositoryEntry(canonicalRoot, normalized, destinationRoot, limits, budget)
  }
}

async function copyRepositoryEntry(
  canonicalRoot: string,
  relativePath: string,
  destinationRoot: string,
  limits: SandboxLimits,
  budget: CopyBudget,
): Promise<void> {
  if (containsExcludedDirectory(relativePath)) {
    throw new SandboxWorkspaceBoundaryError(`Repository selection is excluded: ${relativePath}.`)
  }
  const sourcePath = safeJoin(canonicalRoot, relativePath)
  const metadata = await lstat(sourcePath)
  if (metadata.isSymbolicLink()) {
    throw new SandboxWorkspaceBoundaryError(`Repository symlink rejected: ${relativePath}.`)
  }
  const canonicalSource = await realpath(sourcePath)
  if (!isInside(canonicalSource, canonicalRoot)) {
    throw new SandboxWorkspaceBoundaryError(
      `Repository path escaped its managed root: ${relativePath}.`,
    )
  }

  if (metadata.isDirectory()) {
    const destination = safeJoin(destinationRoot, relativePath)
    await mkdir(destination, { recursive: true, mode: 0o777 })
    const entries = await readdir(sourcePath, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const child = relativePath === '.' ? entry.name : path.posix.join(relativePath, entry.name)
      if (entry.isSymbolicLink()) {
        throw new SandboxWorkspaceBoundaryError(`Repository symlink rejected: ${child}.`)
      }
      if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue
      await copyRepositoryEntry(canonicalRoot, child, destinationRoot, limits, budget)
    }
    return
  }

  if (!metadata.isFile()) {
    throw new SandboxWorkspaceBoundaryError(
      `Non-regular repository entry rejected: ${relativePath}.`,
    )
  }
  const content = await readFile(sourcePath)
  await writeBoundedFile(destinationRoot, relativePath, content, limits, budget)
}

async function writeBoundedFile(
  destinationRoot: string,
  relativePath: string,
  content: Buffer,
  limits: SandboxLimits,
  budget: CopyBudget,
): Promise<void> {
  const normalized = normalizeRelativePath(relativePath)
  if (content.byteLength > limits.maxFileBytes) {
    throw new SandboxWorkspaceBoundaryError(`Source file exceeds maxFileBytes: ${normalized}.`)
  }
  budget.files += 1
  budget.bytes += content.byteLength
  if (budget.files > limits.maxFiles) {
    throw new SandboxWorkspaceBoundaryError('Source snapshot exceeds maxFiles.')
  }
  if (budget.bytes > limits.maxTotalSourceBytes) {
    throw new SandboxWorkspaceBoundaryError('Source snapshot exceeds maxTotalSourceBytes.')
  }
  const destination = safeJoin(destinationRoot, normalized)
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o777 })
  await writeFile(destination, content, { mode: 0o666, flag: 'wx' })
}

async function makeTreeContainerWritable(root: string): Promise<void> {
  await chmod(root, 0o777)
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await makeTreeContainerWritable(entryPath)
    } else if (entry.isFile()) {
      await chmod(entryPath, 0o666)
    } else {
      throw new SandboxWorkspaceBoundaryError(
        `Non-regular materialized entry rejected: ${entry.name}.`,
      )
    }
  }
}

async function manifestDirectory(
  root: string,
  limits: { readonly maxFiles: number; readonly maxBytes: number },
): Promise<ReadonlyMap<string, WorkspaceManifestEntry>> {
  const manifest = new Map<string, WorkspaceManifestEntry>()
  let totalBytes = 0

  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = prefix.length === 0 ? entry.name : path.posix.join(prefix, entry.name)
      const entryPath = path.join(directory, entry.name)
      const metadata = await lstat(entryPath)
      if (metadata.isSymbolicLink()) {
        throw new SandboxWorkspaceBoundaryError(`Generated symlink rejected: ${relativePath}.`)
      }
      if (metadata.isDirectory()) {
        await visit(entryPath, relativePath)
        continue
      }
      if (!metadata.isFile()) {
        throw new SandboxWorkspaceBoundaryError(
          `Generated non-regular file rejected: ${relativePath}.`,
        )
      }
      if (manifest.size + 1 > limits.maxFiles) {
        throw new SandboxWorkspaceBoundaryError('Workspace exceeds maxFiles.')
      }
      totalBytes += metadata.size
      if (totalBytes > limits.maxBytes) {
        throw new SandboxWorkspaceBoundaryError('Workspace exceeds its byte quota.')
      }
      const content = await readFile(entryPath)
      manifest.set(relativePath, {
        path: relativePath,
        sizeBytes: content.byteLength,
        sha256: sha256(content),
      })
    }
  }

  await visit(root, '')
  return manifest
}

function chooseEntrypoint(
  request: SandboxExecutionRequest,
  manifest: ReadonlyMap<string, WorkspaceManifestEntry>,
): string {
  if (request.source !== undefined) return defaultSourceFileName(request.languageId)
  const files = [...manifest.keys()].sort()
  const preferred = ['main.js', 'index.js', 'src/main.js', 'src/index.js']
  for (const candidate of preferred) {
    if (manifest.has(candidate)) return candidate
  }
  const javascript = files.find((filePath) => /\.(?:cjs|mjs|js)$/.test(filePath))
  if (javascript !== undefined) return javascript
  throw new SandboxWorkspaceBoundaryError(
    `No executable JavaScript entrypoint exists in the materialized workspace.`,
  )
}

function buildBoundedPatch(
  inputDir: string,
  outputDir: string,
  remainingBytes: number,
): { readonly content?: Buffer; readonly warning?: string } {
  if (remainingBytes <= 0)
    return { warning: 'Patch omitted because maxArtifactBytes was exhausted.' }
  const result = spawnSync(
    'git',
    ['diff', '--no-index', '--binary', '--no-ext-diff', '--', inputDir, outputDir],
    {
      shell: false,
      encoding: 'buffer',
      maxBuffer: Math.max(1, remainingBytes),
      env: { PATH: process.env['PATH'] },
    },
  )
  if (result.error !== undefined) {
    return { warning: `Patch generation unavailable: ${result.error.message}` }
  }
  if (result.status !== 0 && result.status !== 1) {
    return { warning: `Patch generation failed with status ${result.status ?? 'unknown'}.` }
  }
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '')
  if (stdout.byteLength === 0) return {}
  if (stdout.byteLength > remainingBytes) {
    return { warning: 'Patch omitted because it exceeds the remaining artifact quota.' }
  }
  const normalized = Buffer.from(
    stdout
      .toString('utf8')
      .replaceAll(inputDir.replaceAll('\\', '/'), 'a')
      .replaceAll(outputDir.replaceAll('\\', '/'), 'b'),
    'utf8',
  )
  if (normalized.byteLength > remainingBytes) {
    return { warning: 'Patch omitted because normalized output exceeds the artifact quota.' }
  }
  return { content: normalized }
}

function artifactReference(
  executionId: string,
  name: string,
  content: Buffer,
  mimeType: string,
): SandboxArtifactReference {
  const digest = sha256(content)
  return {
    artifactId: `sandbox-artifact-${sha256(Buffer.from(`${executionId}:${name}:${digest}`)).slice(0, 24)}`,
    name,
    mimeType,
    sizeBytes: content.byteLength,
    sha256: digest,
  }
}

function defaultSourceFileName(languageId: string): string {
  if (languageId === 'javascript') return 'main.js'
  throw new SandboxWorkspaceBoundaryError(
    `Strong container source execution is not implemented for ${languageId}.`,
  )
}

function normalizeRelativePath(value: string): string {
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.includes('\0')
  ) {
    throw new SandboxWorkspaceBoundaryError(`Unsafe relative workspace path: ${value}.`)
  }
  return normalized
}

function safeJoin(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const candidate = path.resolve(root, normalized)
  if (!isInside(candidate, path.resolve(root))) {
    throw new SandboxWorkspaceBoundaryError(`Workspace path escaped its root: ${relativePath}.`)
  }
  return candidate
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate)
  return relative.length === 0 || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function containsExcludedDirectory(relativePath: string): boolean {
  return relativePath
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.')
    .some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment))
}

function safeExecutionId(executionId: string): string {
  const safe = executionId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 48)
  return safe.length === 0 ? 'execution' : safe
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function mimeTypeForPath(filePath: string): string {
  if (/\.(?:cjs|js|mjs|ts|tsx)$/.test(filePath)) return 'text/javascript'
  if (/\.(?:json|map)$/.test(filePath)) return 'application/json'
  if (/\.(?:md|txt|log|csv)$/.test(filePath)) return 'text/plain'
  if (/\.(?:patch|diff)$/.test(filePath)) return 'text/x-diff'
  if (filePath.length <= TEXT_PATCH_MAX_FILE_BYTES) return 'application/octet-stream'
  return 'application/octet-stream'
}
