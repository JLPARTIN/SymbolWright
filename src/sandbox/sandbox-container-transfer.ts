import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { MaterializedSandboxWorkspace } from './sandbox-container-workspace.js'
import type { SandboxLimits } from './sandbox-types.js'

export const SANDBOX_CONTAINER_COPY_IN_SCRIPT = `
const fs = require('node:fs')
const path = require('node:path')
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  const payload = JSON.parse(input)
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.files)) {
    throw new Error('Invalid SymbolWright workspace payload.')
  }
  for (const file of payload.files) {
    if (!file || typeof file.path !== 'string' || typeof file.base64 !== 'string') {
      throw new Error('Invalid SymbolWright workspace file.')
    }
    const normalized = path.posix.normalize(file.path.replaceAll('\\\\', '/'))
    if (
      normalized.length === 0 ||
      path.posix.isAbsolute(normalized) ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      normalized.includes('\\0')
    ) {
      throw new Error('Unsafe SymbolWright workspace file path.')
    }
    const destination = path.posix.join('/workspace', normalized)
    fs.mkdirSync(path.posix.dirname(destination), { recursive: true, mode: 0o700 })
    fs.writeFileSync(destination, Buffer.from(file.base64, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    })
  }
})
`

export const SANDBOX_CONTAINER_COPY_OUT_SCRIPT = `
const fs = require('node:fs')
const path = require('node:path')
const root = '/workspace'
const maxFiles = Number(process.env.SYMBOLWRIGHT_COPY_OUT_MAX_FILES)
const maxBytes = Number(process.env.SYMBOLWRIGHT_COPY_OUT_MAX_BYTES)
if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
  throw new Error('Invalid SymbolWright copy-out limits.')
}
const files = []
let totalBytes = 0
function visit(directory, prefix) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const relativePath = prefix ? path.posix.join(prefix, entry.name) : entry.name
    const absolutePath = path.posix.join(directory, entry.name)
    const metadata = fs.lstatSync(absolutePath)
    if (metadata.isSymbolicLink()) throw new Error('Generated symlink rejected: ' + relativePath)
    if (metadata.isDirectory()) {
      visit(absolutePath, relativePath)
      continue
    }
    if (!metadata.isFile()) throw new Error('Generated non-regular file rejected: ' + relativePath)
    if (files.length + 1 > maxFiles) throw new Error('Generated workspace exceeds maxFiles.')
    totalBytes += metadata.size
    if (totalBytes > maxBytes) throw new Error('Generated workspace exceeds its byte quota.')
    files.push({ path: relativePath, base64: fs.readFileSync(absolutePath).toString('base64') })
  }
}
visit(root, '')
process.stdout.write(JSON.stringify({ schemaVersion: 1, files }))
`

export async function serializeSandboxContainerInput(
  workspace: MaterializedSandboxWorkspace,
): Promise<string> {
  const files: Array<{ readonly path: string; readonly base64: string }> = []
  for (const relativePath of [...workspace.inputManifest.keys()].sort()) {
    const absolutePath = containedPath(workspace.inputDir, relativePath)
    const content = await readFile(absolutePath)
    files.push({ path: relativePath, base64: content.toString('base64') })
  }
  return JSON.stringify({ schemaVersion: 1, files })
}

export async function materializeSandboxContainerOutput(
  workspace: MaterializedSandboxWorkspace,
  serialized: string,
  limits: SandboxLimits,
): Promise<void> {
  const payload = parseTransferPayload(serialized)
  if (payload.files.length > limits.maxFiles) {
    throw new Error('Container copy-out payload exceeds maxFiles.')
  }
  await rm(workspace.outputDir, { recursive: true, force: true })
  await mkdir(workspace.outputDir, { recursive: true, mode: 0o700 })
  const seen = new Set<string>()
  let totalBytes = 0
  for (const file of payload.files) {
    const normalized = normalizeRelativePath(file.path)
    if (seen.has(normalized)) throw new Error(`Duplicate container copy-out path: ${normalized}.`)
    seen.add(normalized)
    const content = Buffer.from(file.base64, 'base64')
    if (content.byteLength > limits.maxFileBytes) {
      throw new Error(`Container copy-out file exceeds maxFileBytes: ${normalized}.`)
    }
    totalBytes += content.byteLength
    if (totalBytes > limits.maxTotalSourceBytes + limits.maxArtifactBytes) {
      throw new Error('Container copy-out payload exceeds its total byte quota.')
    }
    const destination = containedPath(workspace.outputDir, normalized)
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
    await writeFile(destination, content, { flag: 'wx', mode: 0o600 })
  }
}

export function sandboxContainerCopyOutEncodedLimit(limits: SandboxLimits): number {
  const rawLimit = limits.maxTotalSourceBytes + limits.maxArtifactBytes
  return Math.ceil(rawLimit * 1.5) + limits.maxFiles * 256 + 4_096
}

interface TransferPayload {
  readonly schemaVersion: 1
  readonly files: readonly TransferFile[]
}

interface TransferFile {
  readonly path: string
  readonly base64: string
}

function parseTransferPayload(serialized: string): TransferPayload {
  const value = JSON.parse(serialized) as unknown
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('files' in value) ||
    !Array.isArray(value.files)
  ) {
    throw new Error('Invalid container copy-out payload.')
  }
  const files: TransferFile[] = []
  for (const file of value.files) {
    if (
      typeof file !== 'object' ||
      file === null ||
      !('path' in file) ||
      typeof file.path !== 'string' ||
      !('base64' in file) ||
      typeof file.base64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)
    ) {
      throw new Error('Invalid container copy-out file entry.')
    }
    files.push({ path: file.path, base64: file.base64 })
  }
  return { schemaVersion: 1, files }
}

function containedPath(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const candidate = path.resolve(root, normalized)
  const relative = path.relative(path.resolve(root), candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Sandbox transfer path escaped its root: ${relativePath}.`)
  }
  return candidate
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
    throw new Error(`Unsafe sandbox transfer path: ${value}.`)
  }
  return normalized
}
