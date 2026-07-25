import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createDefaultRuntimePolicy } from '../policy/runtime-policy.js'
import type { RuntimeToolContext } from '../types.js'

import { executeListFilesTool } from './list-files-tool.js'

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-list-files-'))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'README.md'), '# test')
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const x = 1')
  fs.writeFileSync(path.join(dir, 'src', 'utils.ts'), 'export const y = 2')
  return dir
}

function makeContext(cwd: string): RuntimeToolContext {
  return { cwd, policy: createDefaultRuntimePolicy() }
}

describe('executeListFilesTool', () => {
  it('lists files in workspace root', async () => {
    const cwd = createTempWorkspace()
    const output = await executeListFilesTool({}, makeContext(cwd))

    expect(output).toContain('SymbolWright list-files')
    expect(output).toContain('README.md')
    expect(output).toContain('index.ts')
    expect(output).toContain('utils.ts')
  })

  it('lists files in a subdirectory', async () => {
    const cwd = createTempWorkspace()
    const output = await executeListFilesTool({ dir: 'src' }, makeContext(cwd))

    expect(output).toContain('Directory: src')
    expect(output).toContain('index.ts')
    expect(output).toContain('utils.ts')
    expect(output).not.toContain('README.md')
  })

  it('respects the limit parameter', async () => {
    const cwd = createTempWorkspace()
    const output = await executeListFilesTool({ limit: 1 }, makeContext(cwd))

    expect(output).toContain('Limit: 1')
    const filesSection = output.split('Files:\n')[1]!.split('\nBoundary:')[0]!
    const fileLines = filesSection
      .split('\n')
      .filter((line) => line.startsWith('- ') && !line.includes('No files'))
    expect(fileLines.length).toBe(1)
  })

  it('skips noisy directories', async () => {
    const cwd = createTempWorkspace()
    fs.mkdirSync(path.join(cwd, 'node_modules'))
    fs.writeFileSync(path.join(cwd, 'node_modules', 'pkg.js'), 'module.exports = {}')

    const output = await executeListFilesTool({}, makeContext(cwd))

    expect(output).not.toContain('pkg.js')
  })

  it('includes boundary markers', async () => {
    const cwd = createTempWorkspace()
    const output = await executeListFilesTool({}, makeContext(cwd))

    expect(output).toContain('Boundary:')
  })

  it('throws on non-directory path', async () => {
    const cwd = createTempWorkspace()

    await expect(executeListFilesTool({ dir: 'README.md' }, makeContext(cwd))).rejects.toThrow(
      'not a directory',
    )
  })

  it('throws on path outside workspace', async () => {
    const cwd = createTempWorkspace()

    await expect(executeListFilesTool({ dir: '../../../etc' }, makeContext(cwd))).rejects.toThrow(
      'blocked',
    )
  })

  it('shows default limit of 100', async () => {
    const cwd = createTempWorkspace()
    const output = await executeListFilesTool({}, makeContext(cwd))

    expect(output).toContain('Limit: 100')
  })

  it('handles empty directory', async () => {
    const cwd = createTempWorkspace()
    fs.mkdirSync(path.join(cwd, 'empty'))
    const output = await executeListFilesTool({ dir: 'empty' }, makeContext(cwd))

    expect(output).toContain('No files found')
  })
})
