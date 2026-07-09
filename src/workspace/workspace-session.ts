import { findLanguageDefinition, getDefaultWorkspaceLanguageId } from './language-registry.js'

export type WorkspaceSessionPanelState = {
  output: string
  errors: string
  diagnostics: string
}

export type WorkspaceSessionFile = WorkspaceSessionPanelState & {
  id: string
  name: string
  languageId: string
  code: string
  dirty: boolean
  createdAt: string
  updatedAt: string
}

export type WorkspaceSession = {
  schemaVersion: 1
  id: string
  name: string
  activeFileId: string
  files: WorkspaceSessionFile[]
  createdAt: string
  updatedAt: string
}

export type WorkspaceSessionExport = {
  exportedAt: string
  session: WorkspaceSession
}

const DEFAULT_SESSION_ID = 'codemind-default-session'
const DEFAULT_FILE_ID = 'file-main'

export function createDefaultWorkspaceSession(now = new Date()): WorkspaceSession {
  const timestamp = now.toISOString()
  const languageId = getDefaultWorkspaceLanguageId()
  const language = findLanguageDefinition(languageId)

  if (language === undefined) {
    throw new Error(`Unable to create workspace session; missing default language: ${languageId}`)
  }

  return {
    schemaVersion: 1,
    id: DEFAULT_SESSION_ID,
    name: 'CodeMind Workspace Session',
    activeFileId: DEFAULT_FILE_ID,
    files: [
      {
        id: DEFAULT_FILE_ID,
        name: `main${language.extensions[0] ?? '.txt'}`,
        languageId,
        code: language.defaultSnippet,
        output: '',
        errors: '',
        diagnostics: language.safetyRestrictions.join('\n'),
        dirty: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createWorkspaceFile(
  input: {
    id: string
    languageId: string
    name?: string
    code?: string
  },
  now = new Date(),
): WorkspaceSessionFile {
  const language = findLanguageDefinition(input.languageId)

  if (language === undefined) {
    throw new Error(`Unknown workspace file language: ${input.languageId}`)
  }

  const timestamp = now.toISOString()

  return {
    id: input.id,
    name: input.name ?? `untitled${language.extensions[0] ?? '.txt'}`,
    languageId: language.id,
    code: input.code ?? language.defaultSnippet,
    output: '',
    errors: '',
    diagnostics: language.safetyRestrictions.join('\n'),
    dirty: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function updateWorkspaceFile(
  session: WorkspaceSession,
  fileId: string,
  patch: Partial<Pick<WorkspaceSessionFile, 'name' | 'languageId' | 'code' | 'output' | 'errors' | 'diagnostics' | 'dirty'>>,
  now = new Date(),
): WorkspaceSession {
  const timestamp = now.toISOString()
  let found = false
  const files = session.files.map((file) => {
    if (file.id !== fileId) {
      return file
    }

    found = true
    return {
      ...file,
      ...patch,
      updatedAt: timestamp,
    }
  })

  if (!found) {
    throw new Error(`Workspace file not found: ${fileId}`)
  }

  return {
    ...session,
    files,
    updatedAt: timestamp,
  }
}

export function addWorkspaceFile(
  session: WorkspaceSession,
  file: WorkspaceSessionFile,
  now = new Date(),
): WorkspaceSession {
  if (session.files.some((existing) => existing.id === file.id)) {
    throw new Error(`Workspace file already exists: ${file.id}`)
  }

  return {
    ...session,
    activeFileId: file.id,
    files: [...session.files, file],
    updatedAt: now.toISOString(),
  }
}

export function removeWorkspaceFile(
  session: WorkspaceSession,
  fileId: string,
  now = new Date(),
): WorkspaceSession {
  if (session.files.length <= 1) {
    throw new Error('Workspace session must keep at least one file.')
  }

  const files = session.files.filter((file) => file.id !== fileId)

  if (files.length === session.files.length) {
    throw new Error(`Workspace file not found: ${fileId}`)
  }

  return {
    ...session,
    activeFileId: session.activeFileId === fileId ? files[0]?.id ?? '' : session.activeFileId,
    files,
    updatedAt: now.toISOString(),
  }
}

export function setActiveWorkspaceFile(
  session: WorkspaceSession,
  fileId: string,
  now = new Date(),
): WorkspaceSession {
  if (!session.files.some((file) => file.id === fileId)) {
    throw new Error(`Workspace file not found: ${fileId}`)
  }

  return {
    ...session,
    activeFileId: fileId,
    updatedAt: now.toISOString(),
  }
}

export function getActiveWorkspaceFile(session: WorkspaceSession): WorkspaceSessionFile {
  const file = session.files.find((candidate) => candidate.id === session.activeFileId)

  if (file === undefined) {
    throw new Error(`Workspace active file is missing: ${session.activeFileId}`)
  }

  return file
}

export function serializeWorkspaceSession(session: WorkspaceSession, now = new Date()): string {
  const exportPayload: WorkspaceSessionExport = {
    exportedAt: now.toISOString(),
    session,
  }

  return `${JSON.stringify(exportPayload, null, 2)}\n`
}

export function parseWorkspaceSessionJson(value: string): WorkspaceSession {
  const parsed = JSON.parse(value) as unknown
  const candidate = unwrapSessionExport(parsed)
  assertWorkspaceSession(candidate)
  return candidate
}

function unwrapSessionExport(value: unknown): unknown {
  if (isRecord(value) && 'session' in value) {
    return value['session']
  }

  return value
}

function assertWorkspaceSession(value: unknown): asserts value is WorkspaceSession {
  if (!isRecord(value)) {
    throw new Error('Workspace session must be an object.')
  }

  if (value['schemaVersion'] !== 1) {
    throw new Error('Unsupported workspace session schema version.')
  }

  if (typeof value['id'] !== 'string' || value['id'].trim().length === 0) {
    throw new Error('Workspace session requires a non-empty id.')
  }

  if (typeof value['name'] !== 'string' || value['name'].trim().length === 0) {
    throw new Error('Workspace session requires a non-empty name.')
  }

  if (typeof value['activeFileId'] !== 'string' || value['activeFileId'].trim().length === 0) {
    throw new Error('Workspace session requires an active file id.')
  }

  if (!Array.isArray(value['files']) || value['files'].length === 0) {
    throw new Error('Workspace session requires at least one file.')
  }

  const ids = new Set<string>()
  for (const file of value['files']) {
    assertWorkspaceSessionFile(file)
    if (ids.has(file.id)) {
      throw new Error(`Duplicate workspace file id: ${file.id}`)
    }
    ids.add(file.id)
  }

  if (!ids.has(value['activeFileId'])) {
    throw new Error(`Workspace active file is missing: ${value['activeFileId']}`)
  }
}

function assertWorkspaceSessionFile(value: unknown): asserts value is WorkspaceSessionFile {
  if (!isRecord(value)) {
    throw new Error('Workspace file must be an object.')
  }

  for (const key of ['id', 'name', 'languageId', 'code', 'output', 'errors', 'diagnostics']) {
    if (typeof value[key] !== 'string') {
      throw new Error(`Workspace file requires string field: ${key}`)
    }
  }

  if (typeof value['dirty'] !== 'boolean') {
    throw new Error('Workspace file requires boolean dirty field.')
  }

  if (findLanguageDefinition(value['languageId']) === undefined) {
    throw new Error(`Workspace file references unknown language: ${value['languageId']}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
