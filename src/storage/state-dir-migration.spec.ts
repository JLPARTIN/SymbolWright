import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { migrateLegacyStateDir } from './state-dir-migration.js'

describe('migrateLegacyStateDir', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'symbolwright-migration-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('scenario A: fresh repository — neither directory exists', () => {
    const result = migrateLegacyStateDir(root)

    expect(result.status).toBe('no_legacy')
    expect(existsSync(path.join(root, '.symbolwright'))).toBe(false)
    expect(existsSync(path.join(root, '.codemind'))).toBe(false)
  })

  it('scenario B: legacy repository — migrates .codemind to .symbolwright without deleting the original', () => {
    const legacy = path.join(root, '.codemind')
    mkdirSync(path.join(legacy, 'sessions'), { recursive: true })
    writeFileSync(path.join(legacy, 'sessions', 'cm-1.jsonl'), '{"hello":"world"}')

    const result = migrateLegacyStateDir(root)

    expect(result.status).toBe('migrated')
    const canonical = path.join(root, '.symbolwright')
    expect(existsSync(path.join(canonical, 'sessions', 'cm-1.jsonl'))).toBe(true)
    expect(readFileSync(path.join(canonical, 'sessions', 'cm-1.jsonl'), 'utf8')).toBe(
      '{"hello":"world"}',
    )
    // Non-destructive: original is renamed aside, never deleted.
    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(`${legacy}.migrated`)).toBe(true)
    expect(existsSync(path.join(`${legacy}.migrated`, 'sessions', 'cm-1.jsonl'))).toBe(true)
  })

  it('scenario C: interrupted migration is resumed deterministically on restart', () => {
    const legacy = path.join(root, '.codemind')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(path.join(legacy, 'data.txt'), 'important')

    // Simulate a crash mid-migration: canonical dir exists with only the
    // in-progress marker, no completed-migration marker.
    const canonical = path.join(root, '.symbolwright')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(path.join(canonical, '.migration-in-progress'), new Date().toISOString())

    const result = migrateLegacyStateDir(root)

    expect(result.status).toBe('migrated')
    expect(readFileSync(path.join(canonical, 'data.txt'), 'utf8')).toBe('important')
    expect(existsSync(path.join(canonical, '.migration-in-progress'))).toBe(false)
    expect(existsSync(path.join(canonical, '.migrated-from-codemind'))).toBe(true)
    // No duplicate mission execution / corruption: exactly one canonical copy.
    expect(readFileSync(path.join(canonical, 'data.txt'), 'utf8')).toBe('important')
  })

  it('scenario D: both directories exist independently — conflict is detected, not silently merged', () => {
    const legacy = path.join(root, '.codemind')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(path.join(legacy, 'legacy-only.txt'), 'old')

    const canonical = path.join(root, '.symbolwright')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(path.join(canonical, 'new-only.txt'), 'new')

    const result = migrateLegacyStateDir(root)

    expect(result.status).toBe('conflict')
    // Neither directory is touched or merged.
    expect(existsSync(path.join(legacy, 'legacy-only.txt'))).toBe(true)
    expect(existsSync(path.join(canonical, 'new-only.txt'))).toBe(true)
    expect(existsSync(path.join(canonical, 'legacy-only.txt'))).toBe(false)
  })

  it('scenario D (already migrated): re-running after a completed migration is a safe no-op', () => {
    const legacy = path.join(root, '.codemind')
    mkdirSync(legacy, { recursive: true })

    const canonical = path.join(root, '.symbolwright')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(
      path.join(canonical, '.migrated-from-codemind'),
      JSON.stringify({ migratedAt: new Date().toISOString() }),
    )

    const result = migrateLegacyStateDir(root)

    expect(result.status).toBe('already_migrated')
  })

  it('scenario E: malformed legacy state fails safely without touching original data', () => {
    // Legacy path exists but is a file, not a directory — malformed.
    writeFileSync(path.join(root, '.codemind'), 'not a directory')

    const result = migrateLegacyStateDir(root)

    expect(result.status).toBe('failed')
    expect(result.message).not.toContain('not a directory\n')
    // Original malformed path is untouched.
    expect(existsSync(path.join(root, '.codemind'))).toBe(true)
    expect(existsSync(path.join(root, '.symbolwright'))).toBe(false)
  })

  it('scenario G: rejects a legacy directory that is a symlink escaping the workspace root', () => {
    const outsideTarget = mkdtempSync(path.join(tmpdir(), 'symbolwright-outside-'))
    writeFileSync(path.join(outsideTarget, 'secret.txt'), 'do not touch')
    const legacyLink = path.join(root, '.codemind')
    symlinkSync(outsideTarget, legacyLink, 'dir')

    const result = migrateLegacyStateDir(root)

    expect(result.status).toBe('failed')
    // The out-of-boundary target is never copied into canonical state.
    expect(existsSync(path.join(root, '.symbolwright'))).toBe(false)

    rmSync(outsideTarget, { recursive: true, force: true })
  })

  it('does not leak error details beyond the affected path', () => {
    writeFileSync(path.join(root, '.codemind'), 'malformed')

    const result = migrateLegacyStateDir(root)

    expect(result.message).toContain(path.join(root, '.codemind'))
  })
})
