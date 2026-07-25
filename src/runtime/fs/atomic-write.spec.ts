import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { atomicWriteFile } from './atomic-write.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-atomic-write-'))
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('atomicWriteFile', () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
  })

  afterEach(() => {
    removeTempDir(dir)
    vi.restoreAllMocks()
  })

  it('writes new content to a file that does not yet exist', () => {
    const target = path.join(dir, 'new-file.txt')

    atomicWriteFile(target, 'hello world')

    expect(fs.readFileSync(target, 'utf8')).toBe('hello world')
  })

  it('creates missing parent directories', () => {
    const target = path.join(dir, 'nested', 'deeper', 'file.txt')

    atomicWriteFile(target, 'nested content')

    expect(fs.readFileSync(target, 'utf8')).toBe('nested content')
  })

  it('overwrites existing content', () => {
    const target = path.join(dir, 'existing.txt')
    fs.writeFileSync(target, 'old content', 'utf8')

    atomicWriteFile(target, 'new content')

    expect(fs.readFileSync(target, 'utf8')).toBe('new content')
  })

  it('leaves no temp file behind after a successful write', () => {
    const target = path.join(dir, 'clean.txt')

    atomicWriteFile(target, 'content')

    const entries = fs.readdirSync(dir)
    expect(entries).toEqual(['clean.txt'])
  })

  it('applies the requested file mode', () => {
    const target = path.join(dir, 'mode.txt')

    atomicWriteFile(target, 'content', { mode: 0o600 })

    const stat = fs.statSync(target)
    expect(stat.mode & 0o777).toBe(0o600)
  })

  it('leaves the original file byte-for-byte unchanged when rename fails mid-write', () => {
    const target = path.join(dir, 'crash.txt')
    fs.writeFileSync(target, 'original content', 'utf8')

    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated crash between temp write and rename')
    })

    expect(() => atomicWriteFile(target, 'attempted new content')).toThrow(
      'simulated crash between temp write and rename',
    )
    renameSpy.mockRestore()

    expect(fs.readFileSync(target, 'utf8')).toBe('original content')
  })

  it('cleans up the orphaned temp file when rename fails', () => {
    const target = path.join(dir, 'crash-cleanup.txt')

    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated crash')
    })

    expect(() => atomicWriteFile(target, 'content')).toThrow('simulated crash')
    renameSpy.mockRestore()

    const entries = fs.readdirSync(dir)
    expect(entries).toEqual([])
  })

  it('does not create the target file at all when rename fails and no original existed', () => {
    const target = path.join(dir, 'never-created.txt')

    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated crash')
    })

    expect(() => atomicWriteFile(target, 'content')).toThrow()
    renameSpy.mockRestore()

    expect(fs.existsSync(target)).toBe(false)
  })
})
