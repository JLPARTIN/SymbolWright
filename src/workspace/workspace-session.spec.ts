import { describe, expect, it } from 'vitest'

import {
  addWorkspaceFile,
  createDefaultWorkspaceSession,
  createWorkspaceFile,
  getActiveWorkspaceFile,
  parseWorkspaceSessionJson,
  removeWorkspaceFile,
  serializeWorkspaceSession,
  setActiveWorkspaceFile,
  updateWorkspaceFile,
} from './workspace-session.js'

describe('workspace session model', () => {
  const now = new Date('2026-07-09T12:00:00.000Z')

  it('creates a default single-file session from the real language registry', () => {
    const session = createDefaultWorkspaceSession(now)

    expect(session.schemaVersion).toBe(1)
    expect(session.activeFileId).toBe('file-main')
    expect(session.files).toHaveLength(1)
    expect(session.files[0]?.languageId).toBe('javascript')
    expect(session.files[0]?.name).toBe('main.js')
    expect(session.files[0]?.code).toContain('greet')
  })

  it('creates language-specific files with default snippets and diagnostics', () => {
    const file = createWorkspaceFile({ id: 'file-python', languageId: 'python' }, now)

    expect(file.name).toBe('untitled.py')
    expect(file.code).toContain('def greet')
    expect(file.diagnostics).toContain('Pyodide')
    expect(file.dirty).toBe(false)
  })

  it('adds, activates, updates, and removes files while preserving invariants', () => {
    const session = createDefaultWorkspaceSession(now)
    const sqlFile = createWorkspaceFile({ id: 'file-sql', languageId: 'sql' }, now)
    const withSql = addWorkspaceFile(session, sqlFile, now)

    expect(withSql.activeFileId).toBe('file-sql')
    expect(withSql.files).toHaveLength(2)

    const updated = updateWorkspaceFile(
      withSql,
      'file-sql',
      { code: 'SELECT 1;', output: '1', dirty: true },
      now,
    )

    expect(getActiveWorkspaceFile(updated).code).toBe('SELECT 1;')
    expect(getActiveWorkspaceFile(updated).output).toBe('1')
    expect(getActiveWorkspaceFile(updated).dirty).toBe(true)

    const activeMain = setActiveWorkspaceFile(updated, 'file-main', now)
    expect(activeMain.activeFileId).toBe('file-main')

    const removed = removeWorkspaceFile(activeMain, 'file-sql', now)
    expect(removed.activeFileId).toBe('file-main')
    expect(removed.files.map((file) => file.id)).toEqual(['file-main'])
  })

  it('serializes and parses exported sessions', () => {
    const session = addWorkspaceFile(
      createDefaultWorkspaceSession(now),
      createWorkspaceFile({ id: 'file-md', languageId: 'markdown', code: '# Notes' }, now),
      now,
    )
    const serialized = serializeWorkspaceSession(session, now)
    const parsed = parseWorkspaceSessionJson(serialized)

    expect(parsed.name).toBe('CodeMind Workspace Session')
    expect(parsed.activeFileId).toBe('file-md')
    expect(parsed.files.map((file) => file.languageId)).toEqual(['javascript', 'markdown'])
  })

  it('rejects invalid imports instead of silently creating broken sessions', () => {
    expect(() => parseWorkspaceSessionJson('{}')).toThrow('Unsupported workspace session schema version')
    expect(() =>
      parseWorkspaceSessionJson(
        JSON.stringify({
          schemaVersion: 1,
          id: 'bad',
          name: 'Bad',
          activeFileId: 'missing',
          files: [],
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      ),
    ).toThrow('requires at least one file')
    expect(() => createWorkspaceFile({ id: 'bad', languageId: 'unknown' })).toThrow(
      'Unknown workspace file language',
    )
  })

  it('prevents duplicate files, missing active files, and deleting the final file', () => {
    const session = createDefaultWorkspaceSession(now)
    const duplicate = createWorkspaceFile({ id: 'file-main', languageId: 'javascript' }, now)

    expect(() => addWorkspaceFile(session, duplicate, now)).toThrow('already exists')
    expect(() => setActiveWorkspaceFile(session, 'missing', now)).toThrow('not found')
    expect(() => removeWorkspaceFile(session, 'file-main', now)).toThrow('must keep at least one file')
  })
})
