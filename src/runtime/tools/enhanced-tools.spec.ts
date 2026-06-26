import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { executeGlobTool } from './glob-tool.js'
import { executeGrepTool } from './grep-tool.js'
import { executeEditFileTool } from './edit-file-tool.js'
import { executeBashTool } from './bash-tool.js'

let tempDir: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-test-'))
  fs.writeFileSync(path.join(tempDir, 'hello.ts'), 'export function hello() { return "Hello" }\n')
  fs.writeFileSync(path.join(tempDir, 'world.ts'), 'export function world() { return "World" }\n')
  fs.mkdirSync(path.join(tempDir, 'sub'))
  fs.writeFileSync(path.join(tempDir, 'sub', 'nested.ts'), 'export const nested = true\n')
  fs.writeFileSync(path.join(tempDir, 'readme.md'), '# Test Project\n')
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('glob-tool', () => {
  it('finds files matching pattern', async () => {
    const result = await executeGlobTool({ pattern: '**/*.ts' }, tempDir)
    expect(result).toContain('hello.ts')
    expect(result).toContain('world.ts')
    expect(result).toContain('nested.ts')
  })

  it('respects maxResults', async () => {
    const result = await executeGlobTool({ pattern: '**/*.ts', maxResults: 1 }, tempDir)
    expect(result).toContain('Matches: 1')
    expect(result).toContain('truncated')
  })

  it('shows no matches for non-matching pattern', async () => {
    const result = await executeGlobTool({ pattern: '**/*.py' }, tempDir)
    expect(result).toContain('Matches: 0')
  })
})

describe('grep-tool', () => {
  it('finds pattern in files', async () => {
    const result = await executeGrepTool({ pattern: 'function hello' }, tempDir)
    expect(result).toContain('hello.ts')
    expect(result).toContain('function hello')
  })

  it('shows context lines', async () => {
    const result = await executeGrepTool({ pattern: 'export', contextLines: 0 }, tempDir)
    expect(result).toContain('export')
  })

  it('returns no matches for non-matching pattern', async () => {
    const result = await executeGrepTool({ pattern: 'nonexistent_string_xyz' }, tempDir)
    expect(result).toContain('No matches found')
  })

  it('handles invalid regex gracefully', async () => {
    const result = await executeGrepTool({ pattern: '[invalid(' }, tempDir)
    expect(result).toContain('Invalid regex')
  })

  it('respects maxResults', async () => {
    const result = await executeGrepTool({ pattern: 'export', maxResults: 1 }, tempDir)
    expect(result).toContain('Matches: 1')
  })
})

describe('edit-file-tool', () => {
  const allowWrite = (): void => {}

  it('replaces text in a file', async () => {
    const result = await executeEditFileTool(
      { path: 'hello.ts', oldText: '"Hello"', newText: '"Hi"' },
      tempDir,
      allowWrite,
    )

    expect(result).toContain('Replacements: 1')
    const content = fs.readFileSync(path.join(tempDir, 'hello.ts'), 'utf-8')
    expect(content).toContain('"Hi"')
    expect(content).not.toContain('"Hello"')
  })

  it('fails when oldText not found', async () => {
    await expect(
      executeEditFileTool(
        { path: 'hello.ts', oldText: 'NONEXISTENT', newText: 'replacement' },
        tempDir,
        allowWrite,
      ),
    ).rejects.toThrow('oldText not found')
  })

  it('fails when file does not exist', async () => {
    await expect(
      executeEditFileTool(
        { path: 'nonexistent.ts', oldText: 'a', newText: 'b' },
        tempDir,
        allowWrite,
      ),
    ).rejects.toThrow('File not found')
  })

  it('fails when oldText appears multiple times without replaceAll', async () => {
    fs.writeFileSync(path.join(tempDir, 'dup.ts'), 'foo bar foo')
    await expect(
      executeEditFileTool(
        { path: 'dup.ts', oldText: 'foo', newText: 'baz' },
        tempDir,
        allowWrite,
      ),
    ).rejects.toThrow('multiple times')
  })

  it('replaces all occurrences with replaceAll flag', async () => {
    fs.writeFileSync(path.join(tempDir, 'dup.ts'), 'foo bar foo')
    const result = await executeEditFileTool(
      { path: 'dup.ts', oldText: 'foo', newText: 'baz', replaceAll: true },
      tempDir,
      allowWrite,
    )

    expect(result).toContain('Replacements: 2')
    const content = fs.readFileSync(path.join(tempDir, 'dup.ts'), 'utf-8')
    expect(content).toBe('baz bar baz')
  })

  it('fails when write assertion fails', async () => {
    const blockWrite = (): void => {
      throw new Error('Write blocked by policy')
    }
    await expect(
      executeEditFileTool(
        { path: 'hello.ts', oldText: '"Hello"', newText: '"Hi"' },
        tempDir,
        blockWrite,
      ),
    ).rejects.toThrow('Write blocked')
  })
})

describe('bash-tool', () => {
  it('executes allowed command', async () => {
    const result = await executeBashTool({ command: 'ls' }, tempDir, true)
    expect(result).toContain('hello.ts')
    expect(result).toContain('Exit code: 0')
  })

  it('blocks when shell not allowed', async () => {
    const result = await executeBashTool({ command: 'ls' }, tempDir, false)
    expect(result).toContain('BLOCKED')
    expect(result).toContain('not allowed')
  })

  it('blocks dangerous commands', async () => {
    const result = await executeBashTool({ command: 'rm -rf /' }, tempDir, true)
    expect(result).toContain('BLOCKED')
    expect(result).toContain('not in the allowlist')
  })

  it('blocks sudo commands', async () => {
    const result = await executeBashTool({ command: 'sudo rm file' }, tempDir, true)
    expect(result).toContain('BLOCKED')
  })

  it('captures stderr', async () => {
    const result = await executeBashTool({ command: 'ls /nonexistent_dir_xyz 2>&1' }, tempDir, true)
    // ls is allowed and will show error output
    expect(result).toContain('Exit code:')
  })

  it('allows git status', async () => {
    const result = await executeBashTool({ command: 'git status' }, tempDir, true)
    expect(result).toContain('Exit code:')
  })
})
