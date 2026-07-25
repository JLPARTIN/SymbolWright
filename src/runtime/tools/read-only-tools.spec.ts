import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createFixtureContext,
  createFixtureRegistry,
} from '../registry/fixture-registry-factory.js'

function createFixtureWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-runtime-'))
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture\n\nSymbolWright runtime fixture.\n')
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const fixture = true\n')
  return dir
}

describe('read-only runtime tools', () => {
  it('registers Phase A tools', () => {
    const registry = createFixtureRegistry('read_only')

    expect(registry.list().map((entry) => entry.name)).toEqual([
      'plan_goal',
      'list_files',
      'read_file',
      'search_files',
      'validation_plan',
    ])
  })

  it('reads allowed workspace files', async () => {
    const cwd = createFixtureWorkspace()
    const tool = createFixtureRegistry('read_only').getOrThrow('read_file')

    await expect(tool.execute({ path: 'README.md' }, createFixtureContext(cwd))).resolves.toContain(
      'SymbolWright runtime fixture.',
    )
  })

  it('blocks protected paths', async () => {
    const cwd = createFixtureWorkspace()
    fs.mkdirSync(path.join(cwd, '.git'))
    fs.writeFileSync(path.join(cwd, '.git', 'config'), 'secret')
    const tool = createFixtureRegistry('read_only').getOrThrow('read_file')

    await expect(tool.execute({ path: '.git/config' }, createFixtureContext(cwd))).rejects.toThrow(
      'protected path',
    )
  })

  it('searches allowed files', async () => {
    const cwd = createFixtureWorkspace()
    const tool = createFixtureRegistry('read_only').getOrThrow('search_files')

    await expect(tool.execute({ query: 'fixture' }, createFixtureContext(cwd))).resolves.toContain(
      'README.md',
    )
  })

  it('renders validation guidance without execution', async () => {
    const cwd = createFixtureWorkspace()
    const tool = createFixtureRegistry('read_only').getOrThrow('validation_plan')

    const output = await tool.execute({ focus: 'runtime activation' }, createFixtureContext(cwd))

    expect(output).toContain('SymbolWright validation plan')
    expect(output).toContain('npm run typecheck')
    expect(output).toContain('does not run commands')
  })
})
