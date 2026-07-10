import { describe, expect, it } from 'vitest'

import {
  detectWorkspaceLanguageIdByProjectPath,
  safeWorkspaceProjectPath,
  slugifyWorkspaceName,
} from './workspace-client-logic.js'

describe('slugifyWorkspaceName', () => {
  it('lowercases and hyphenates unsafe characters', () => {
    expect(slugifyWorkspaceName('My Session!! 42')).toBe('my-session-42')
  })

  it('falls back to a default when everything is stripped', () => {
    expect(slugifyWorkspaceName('***')).toBe('codemind-workspace')
  })
})

describe('safeWorkspaceProjectPath', () => {
  it('normalizes backslashes and strips leading slashes', () => {
    expect(safeWorkspaceProjectPath('\\src\\index.ts')).toBe('src/index.ts')
  })

  it('rejects path traversal', () => {
    expect(() => safeWorkspaceProjectPath('../etc/passwd')).toThrow(/Unsafe project bundle/)
  })

  it('rejects empty paths', () => {
    expect(() => safeWorkspaceProjectPath('   ')).toThrow(/Unsafe project bundle/)
  })
})

describe('detectWorkspaceLanguageIdByProjectPath', () => {
  const languages = [
    { id: 'typescript', extensions: ['.ts', '.tsx'] },
    { id: 'python', extensions: ['.py'] },
    { id: 'dockerfile', extensions: ['dockerfile'] },
  ]

  it('matches by dotted extension', () => {
    expect(detectWorkspaceLanguageIdByProjectPath('src/index.ts', languages)).toBe('typescript')
  })

  it('matches a bare filename extension entry', () => {
    expect(
      detectWorkspaceLanguageIdByProjectPath('build/Dockerfile'.toLowerCase(), languages),
    ).toBe('dockerfile')
  })

  it('falls back to markdown when nothing matches', () => {
    expect(detectWorkspaceLanguageIdByProjectPath('README.unknownext', languages)).toBe('markdown')
  })
})
