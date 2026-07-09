import { findLanguageDefinition, UNIVERSAL_LANGUAGE_REGISTRY } from './language-registry.js'
import type { WorkspaceSession, WorkspaceSessionFile } from './workspace-session.js'

export type WorkspaceProjectBundleFileManifest = {
  path: string
  languageId: string
  sizeBytes: number
}

export type WorkspaceProjectManifest = {
  schemaVersion: 1
  projectId: string
  name: string
  exportedAt: string
  files: WorkspaceProjectBundleFileManifest[]
  safetyWarnings: string[]
}

export type WorkspaceProjectBundleFile = {
  path: string
  content: string
}

export type WorkspaceProjectBundle = {
  kind: 'codemind.workspace.project-bundle'
  schemaVersion: 1
  manifest: WorkspaceProjectManifest
  files: WorkspaceProjectBundleFile[]
}

const PROJECT_BUNDLE_KIND = 'codemind.workspace.project-bundle'
const MAX_PROJECT_FILES = 100
const MAX_FILE_BYTES = 200_000
const MAX_PROJECT_BYTES = 2_000_000

const PROJECT_BUNDLE_WARNINGS = [
  'This bundle is browser-local import/export data; importing it does not write to a Git repository.',
  'Review file names and code before running snippets or sending them to an AI provider.',
  'Executable capability still depends on CodeMind language registry runner support.',
] as const

export function detectLanguageIdByPath(path: string): string {
  const normalized = path.trim().toLowerCase()
  const fileName = normalized.split('/').pop() ?? normalized

  const match = UNIVERSAL_LANGUAGE_REGISTRY.find((language) =>
    language.extensions.some((extension) => {
      const normalizedExtension = extension.toLowerCase()
      if (normalizedExtension.startsWith('.')) {
        return fileName.endsWith(normalizedExtension)
      }

      return fileName === normalizedExtension || normalized.endsWith(`/${normalizedExtension}`)
    }),
  )

  return match?.id ?? 'markdown'
}

export function createWorkspaceProjectBundleFromSession(
  session: WorkspaceSession,
  now = new Date(),
): WorkspaceProjectBundle {
  const exportedAt = now.toISOString()
  const paths = new Set<string>()
  const files = session.files.map((file, index) => {
    const path = uniquePath(sanitizeProjectPath(file.name), paths, index)
    return {
      path,
      content: file.code,
    }
  })

  const manifestFiles = files.map((file, index) => ({
    path: file.path,
    languageId: session.files[index]?.languageId ?? detectLanguageIdByPath(file.path),
    sizeBytes: byteLength(file.content),
  }))

  return {
    kind: PROJECT_BUNDLE_KIND,
    schemaVersion: 1,
    manifest: {
      schemaVersion: 1,
      projectId: session.id,
      name: session.name,
      exportedAt,
      files: manifestFiles,
      safetyWarnings: [...PROJECT_BUNDLE_WARNINGS],
    },
    files,
  }
}

export function serializeWorkspaceProjectBundle(bundle: WorkspaceProjectBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`
}

export function parseWorkspaceProjectBundleJson(value: string): WorkspaceProjectBundle {
  const parsed = JSON.parse(value) as unknown
  assertWorkspaceProjectBundle(parsed)
  return parsed
}

export function createWorkspaceSessionFromProjectBundle(
  bundle: WorkspaceProjectBundle,
  now = new Date(),
): WorkspaceSession {
  assertWorkspaceProjectBundle(bundle)

  const timestamp = now.toISOString()
  const files = bundle.files.map((bundleFile, index): WorkspaceSessionFile => {
    const manifestFile = bundle.manifest.files.find((file) => file.path === bundleFile.path)
    const languageId = resolveBundleLanguageId(manifestFile?.languageId, bundleFile.path)
    const language = findLanguageDefinition(languageId)

    if (language === undefined) {
      throw new Error(`Project bundle file references unsupported language: ${languageId}`)
    }

    return {
      id: `project-file-${index + 1}`,
      name: bundleFile.path,
      languageId: language.id,
      code: bundleFile.content,
      output: '',
      errors: '',
      diagnostics: language.safetyRestrictions.concat(language.notes ? [language.notes] : []).join('\n'),
      dirty: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })

  return {
    schemaVersion: 1,
    id: `project-${slugify(bundle.manifest.projectId || bundle.manifest.name)}`,
    name: bundle.manifest.name,
    activeFileId: files[0]?.id ?? 'project-file-1',
    files,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function assertWorkspaceProjectBundle(value: unknown): asserts value is WorkspaceProjectBundle {
  if (!isRecord(value)) {
    throw new Error('Workspace project bundle must be an object.')
  }

  if (value['kind'] !== PROJECT_BUNDLE_KIND) {
    throw new Error('Unsupported workspace project bundle kind.')
  }

  if (value['schemaVersion'] !== 1) {
    throw new Error('Unsupported workspace project bundle schema version.')
  }

  const manifest = value['manifest']
  if (!isRecord(manifest)) {
    throw new Error('Workspace project bundle requires a manifest.')
  }

  if (manifest['schemaVersion'] !== 1) {
    throw new Error('Unsupported workspace project manifest schema version.')
  }

  if (typeof manifest['projectId'] !== 'string' || manifest['projectId'].trim().length === 0) {
    throw new Error('Workspace project manifest requires a project id.')
  }

  if (typeof manifest['name'] !== 'string' || manifest['name'].trim().length === 0) {
    throw new Error('Workspace project manifest requires a project name.')
  }

  const files = value['files']
  const manifestFiles = manifest['files']
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Workspace project bundle requires at least one file.')
  }

  if (files.length > MAX_PROJECT_FILES) {
    throw new Error(`Workspace project bundle exceeds ${MAX_PROJECT_FILES} files.`)
  }

  if (!Array.isArray(manifestFiles) || manifestFiles.length !== files.length) {
    throw new Error('Workspace project manifest file list must match bundle files.')
  }

  const seenPaths = new Set<string>()
  let totalBytes = 0

  for (const file of files) {
    if (!isRecord(file)) {
      throw new Error('Workspace project bundle file must be an object.')
    }

    const path = expectStringField(file, 'path')
    const content = expectStringField(file, 'content')
    validateProjectPath(path)

    if (seenPaths.has(path)) {
      throw new Error(`Duplicate project bundle file path: ${path}`)
    }

    seenPaths.add(path)
    const size = byteLength(content)
    if (size > MAX_FILE_BYTES) {
      throw new Error(`Project bundle file exceeds ${MAX_FILE_BYTES} bytes: ${path}`)
    }

    totalBytes += size
  }

  if (totalBytes > MAX_PROJECT_BYTES) {
    throw new Error(`Workspace project bundle exceeds ${MAX_PROJECT_BYTES} bytes.`)
  }

  for (const manifestFile of manifestFiles) {
    if (!isRecord(manifestFile)) {
      throw new Error('Workspace project manifest file entry must be an object.')
    }

    const path = expectStringField(manifestFile, 'path')
    const languageId = expectStringField(manifestFile, 'languageId')
    if (!seenPaths.has(path)) {
      throw new Error(`Workspace project manifest references missing file: ${path}`)
    }

    if (findLanguageDefinition(languageId) === undefined) {
      throw new Error(`Workspace project manifest references unknown language: ${languageId}`)
    }
  }
}

function resolveBundleLanguageId(languageId: string | undefined, path: string): string {
  if (languageId !== undefined && findLanguageDefinition(languageId) !== undefined) {
    return languageId
  }

  return detectLanguageIdByPath(path)
}

function sanitizeProjectPath(path: string): string {
  const normalized = path.trim().replaceAll('\\', '/').replace(/^\/+/, '')
  const safe = normalized.length === 0 ? 'untitled.txt' : normalized
  validateProjectPath(safe)
  return safe
}

function validateProjectPath(path: string): void {
  if (path.trim().length === 0) {
    throw new Error('Project bundle file path cannot be empty.')
  }

  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new Error(`Unsafe project bundle file path: ${path}`)
  }
}

function uniquePath(path: string, existing: Set<string>, index: number): string {
  if (!existing.has(path)) {
    existing.add(path)
    return path
  }

  const dotIndex = path.lastIndexOf('.')
  const base = dotIndex > 0 ? path.slice(0, dotIndex) : path
  const extension = dotIndex > 0 ? path.slice(dotIndex) : ''
  let candidate = `${base}-${index + 1}${extension}`
  let counter = index + 1

  while (existing.has(candidate)) {
    counter += 1
    candidate = `${base}-${counter}${extension}`
  }

  existing.add(candidate)
  return candidate
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '')
  return slug.length === 0 ? 'workspace-project' : slug
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function expectStringField(value: Record<string, unknown>, key: string): string {
  const field = value[key]

  if (typeof field !== 'string') {
    throw new Error(`Workspace project bundle requires string field: ${key}`)
  }

  return field
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
