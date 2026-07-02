import { describe, expect, it } from 'vitest'

import { collectCommandEvidence, renderScriptCommand } from './command-evidence.js'
import type { CommandResult } from './types.js'

describe('command evidence collection', () => {
  it('renders detected package manager commands', () => {
    expect(renderScriptCommand('npm', 'test')).toBe('npm run test')
    expect(renderScriptCommand('pnpm', 'test')).toBe('pnpm run test')
    expect(renderScriptCommand('yarn', 'test')).toBe('yarn run test')
  })

  it('marks missing scripts as missing, not passed', async () => {
    const results = await collectCommandEvidence(
      '/repo',
      'npm',
      ['format:check'],
      new Set(['test']),
      () => {
        throw new Error('should not execute missing script')
      },
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ script: 'format:check', status: 'missing' })
  })

  it('blocks unknown and conflicting package managers before execution', async () => {
    const unknown = await collectCommandEvidence(
      '/repo',
      'unknown',
      ['test'],
      new Set(['test']),
      () => {
        throw new Error('should not execute unknown package manager')
      },
    )
    const conflict = await collectCommandEvidence(
      '/repo',
      'conflict',
      ['test'],
      new Set(['test']),
      () => {
        throw new Error('should not execute conflicting package manager')
      },
    )

    expect(unknown[0]).toMatchObject({ status: 'blocked' })
    expect(conflict[0]).toMatchObject({ status: 'blocked' })
  })

  it('uses provided evidence for available scripts', async () => {
    const results = await collectCommandEvidence(
      '/repo',
      'npm',
      ['test'],
      new Set(['test']),
      ({ packageManager, script, command }): CommandResult => ({
        packageManager,
        script,
        command,
        status: 'passed',
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        durationMs: 1,
      }),
    )

    expect(results[0]).toMatchObject({ script: 'test', command: 'npm run test', status: 'passed' })
  })
})
