import { describe, expect, it } from 'vitest'

import {
  addWorkspaceFile,
  createDefaultWorkspaceSession,
  createWorkspaceFile,
} from './workspace-session.js'
import {
  createWorkspaceProjectBundleFromSession,
  createWorkspaceSessionFromProjectBundle,
  detectLanguageIdByPath,
  parseWorkspaceProjectBundleJson,
  serializeWorkspaceProjectBundle,
} from './workspace-project-bundle.js'

describe('workspace project bundle model', () => {
  const now = new Date('2026-07-09T12:00:00.000Z')

  function expectInvalidBundle(value: unknown, message: string): void {
    expect(() => parseWorkspaceProjectBundleJson(JSON.stringify(value))).toThrow(message)
  }

  it('detects languages from project file extensions', () => {
    expect(detectLanguageIdByPath('src/index.ts')).toBe('typescript')
    expect(detectLanguageIdByPath('app/main.py')).toBe('python')
    expect(detectLanguageIdByPath('queries/report.sql')).toBe('sql')
    expect(detectLanguageIdByPath('public/index.html')).toBe('html')
    expect(detectLanguageIdByPath('Dockerfile')).toBe('dockerfile')
    expect(detectLanguageIdByPath('notes/unknown.custom')).toBe('markdown')
  })

  it('exports a workspace session as a project bundle with manifest metadata', () => {
    const session = addWorkspaceFile(
      createDefaultWorkspaceSession(now),
      createWorkspaceFile({ id: 'file-sql', languageId: 'sql', name: 'queries/report.sql' }, now),
      now,
    )
    const bundle = createWorkspaceProjectBundleFromSession(session, now)

    expect(bundle.kind).toBe('codemind.workspace.project-bundle')
    expect(bundle.schemaVersion).toBe(1)
    expect(bundle.manifest.name).toBe('CodeMind Workspace Session')
    expect(bundle.manifest.files.map((file) => file.path)).toEqual([
      'main.js',
      'queries/report.sql',
    ])
    expect(bundle.manifest.files.map((file) => file.languageId)).toEqual(['javascript', 'sql'])
    expect(bundle.manifest.safetyWarnings.join('\n')).toContain(
      'does not write to a Git repository',
    )
    expect(bundle.files[1]?.content).toContain('CREATE TABLE users')
  })

  it('deduplicates exported file paths without losing content', () => {
    const session = addWorkspaceFile(
      createDefaultWorkspaceSession(now),
      createWorkspaceFile(
        { id: 'file-js-2', languageId: 'javascript', name: 'main.js', code: 'console.log(2)' },
        now,
      ),
      now,
    )
    const bundle = createWorkspaceProjectBundleFromSession(session, now)

    expect(bundle.files.map((file) => file.path)).toEqual(['main.js', 'main-2.js'])
    expect(bundle.files[1]?.content).toBe('console.log(2)')
  })

  it('sanitizes blank browser-local file names and slugifies empty project ids', () => {
    const base = createDefaultWorkspaceSession(now)
    const blankNameSession = {
      ...base,
      id: '!!!',
      files: [{ ...base.files[0]!, name: '   ', languageId: 'markdown' }],
    }
    const bundle = createWorkspaceProjectBundleFromSession(blankNameSession, now)
    const imported = createWorkspaceSessionFromProjectBundle(bundle, now)

    expect(bundle.files[0]?.path).toBe('untitled.txt')
    expect(imported.id).toBe('project-workspace-project')
  })

  it('serializes, parses, and imports a bundle into a workspace session', () => {
    const bundle = createWorkspaceProjectBundleFromSession(createDefaultWorkspaceSession(now), now)
    const serialized = serializeWorkspaceProjectBundle(bundle)
    const parsed = parseWorkspaceProjectBundleJson(serialized)
    const session = createWorkspaceSessionFromProjectBundle(parsed, now)

    expect(session.name).toBe('CodeMind Workspace Session')
    expect(session.files).toHaveLength(1)
    expect(session.files[0]?.name).toBe('main.js')
    expect(session.files[0]?.languageId).toBe('javascript')
    expect(session.files[0]?.diagnostics.length).toBeGreaterThan(0)
  })

  it('rejects invalid project bundles and unsafe paths', () => {
    expect(() => parseWorkspaceProjectBundleJson('{}')).toThrow(
      'Unsupported workspace project bundle kind',
    )

    const bundle = createWorkspaceProjectBundleFromSession(createDefaultWorkspaceSession(now), now)
    const unsafe = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        files: [{ ...bundle.manifest.files[0], path: '../secret.txt' }],
      },
      files: [{ path: '../secret.txt', content: 'nope' }],
    }

    expect(() => parseWorkspaceProjectBundleJson(JSON.stringify(unsafe))).toThrow(
      'Unsafe project bundle file path',
    )
  })

  it('rejects bundles whose manifest disagrees with bundle files', () => {
    const bundle = createWorkspaceProjectBundleFromSession(createDefaultWorkspaceSession(now), now)
    const broken = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        files: [{ ...bundle.manifest.files[0], path: 'missing.js' }],
      },
    }

    expect(() => parseWorkspaceProjectBundleJson(JSON.stringify(broken))).toThrow(
      'manifest references missing file',
    )
  })

  it('covers malformed project bundle schema and manifest branches', () => {
    const bundle = createWorkspaceProjectBundleFromSession(createDefaultWorkspaceSession(now), now)

    expect(() => parseWorkspaceProjectBundleJson('null')).toThrow(
      'Workspace project bundle must be an object',
    )
    expectInvalidBundle({ ...bundle, schemaVersion: 2 }, 'schema version')
    expectInvalidBundle({ ...bundle, manifest: null }, 'requires a manifest')
    expectInvalidBundle(
      { ...bundle, manifest: { ...bundle.manifest, schemaVersion: 2 } },
      'manifest schema version',
    )
    expectInvalidBundle(
      { ...bundle, manifest: { ...bundle.manifest, projectId: '' } },
      'project id',
    )
    expectInvalidBundle(
      { ...bundle, manifest: { ...bundle.manifest, name: '' } },
      'project name',
    )
    expectInvalidBundle({ ...bundle, files: [] }, 'at least one file')
    expectInvalidBundle(
      { ...bundle, manifest: { ...bundle.manifest, files: [] } },
      'file list must match',
    )
    expectInvalidBundle(
      { ...bundle, manifest: { ...bundle.manifest, files: [null] } },
      'manifest file entry',
    )
    expectInvalidBundle(
      {
        ...bundle,
        manifest: {
          ...bundle.manifest,
          files: [{ ...bundle.manifest.files[0], languageId: 'unknown-language' }],
        },
      },
      'unknown language',
    )
  })

  it('covers malformed project bundle file branches and size limits', () => {
    const bundle = createWorkspaceProjectBundleFromSession(createDefaultWorkspaceSession(now), now)
    const file = bundle.files[0]!
    const manifestFile = bundle.manifest.files[0]!

    expectInvalidBundle({ ...bundle, files: [null] }, 'bundle file must be an object')
    expectInvalidBundle({ ...bundle, files: [{ ...file, path: 123 }] }, 'string field: path')
    expectInvalidBundle({ ...bundle, files: [{ ...file, content: 123 }] }, 'string field: content')
    expectInvalidBundle({ ...bundle, files: [{ ...file, path: '' }] }, 'path cannot be empty')
    expectInvalidBundle({ ...bundle, files: [{ ...file, path: '/absolute.js' }] }, 'Unsafe')
    expectInvalidBundle(
      {
        ...bundle,
        files: [file, { ...file }],
        manifest: { ...bundle.manifest, files: [manifestFile, { ...manifestFile }] },
      },
      'Duplicate project bundle file path',
    )
    expectInvalidBundle(
      {
        ...bundle,
        files: [{ ...file, content: 'x'.repeat(200_001) }],
      },
      'file exceeds',
    )

    const tooManyFiles = Array.from({ length: 101 }, (_, index) => ({
      path: `file-${index}.js`,
      content: 'x',
    }))
    const tooManyManifestFiles = tooManyFiles.map((entry) => ({
      path: entry.path,
      languageId: 'javascript',
      sizeBytes: 1,
    }))
    expectInvalidBundle(
      {
        ...bundle,
        files: tooManyFiles,
        manifest: { ...bundle.manifest, files: tooManyManifestFiles },
      },
      'exceeds 100 files',
    )

    const largeFiles = Array.from({ length: 11 }, (_, index) => ({
      path: `large-${index}.txt`,
      content: 'x'.repeat(190_000),
    }))
    const largeManifestFiles = largeFiles.map((entry) => ({
      path: entry.path,
      languageId: 'markdown',
      sizeBytes: entry.content.length,
    }))
    expectInvalidBundle(
      {
        ...bundle,
        files: largeFiles,
        manifest: { ...bundle.manifest, files: largeManifestFiles },
      },
      'exceeds 2000000 bytes',
    )
  })
})
