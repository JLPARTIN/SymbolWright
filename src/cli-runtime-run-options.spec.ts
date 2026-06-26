import { describe, expect, it } from 'vitest'

import { parseRuntimeRunArgs } from './cli-runtime-run-options.js'
import { renderRuntimeRun } from './cli-runtime-run.js'

describe('parseRuntimeRunArgs', () => {
  it('parses read-only runtime run controls without leaking flags into the goal', () => {
    expect(
      parseRuntimeRunArgs(['prepare', 'operator', 'ux', '--read-only', '--max-iterations', '2', '--json']),
    ).toEqual({
      goal: 'prepare operator ux',
      readOnly: true,
      json: true,
      maxIterations: 2,
    })
  })

  it('parses equals-style max iteration controls', () => {
    expect(parseRuntimeRunArgs(['ship', 'json', '--read-only', '--max-iterations=3'])).toEqual({
      goal: 'ship json',
      readOnly: true,
      json: false,
      maxIterations: 3,
    })
  })

  it('rejects missing max iteration values', () => {
    expect(() => parseRuntimeRunArgs(['ship', '--read-only', '--max-iterations'])).toThrow('Missing value')
  })

  it('rejects unsafe max iteration values', () => {
    expect(() => parseRuntimeRunArgs(['ship', '--read-only', '--max-iterations', '0'])).toThrow('between 1 and 25')
    expect(() => parseRuntimeRunArgs(['ship', '--read-only', '--max-iterations', '26'])).toThrow('between 1 and 25')
    expect(() => parseRuntimeRunArgs(['ship', '--read-only', '--max-iterations', 'two'])).toThrow('Invalid')
  })

  it('rejects unknown runtime run flags', () => {
    expect(() => parseRuntimeRunArgs(['ship', '--read-only', '--write'])).toThrow('Unknown runtime run flag')
  })
})

describe('renderRuntimeRun', () => {
  it('honors the operator max iteration control in text output', async () => {
    const output = await renderRuntimeRun(['prepare', 'operator', 'ux', '--read-only', '--max-iterations', '1'])

    expect(output).toContain('Status: iteration_limit')
    expect(output).toContain('Goal: prepare operator ux')
    expect(output).toContain('Max iterations: 1')
    expect(output).toContain('invoke plan_goal')
    expect(output).not.toContain('--max-iterations')
  })

  it('renders machine-readable JSON output for operator consoles', async () => {
    const output = await renderRuntimeRun(['prepare', 'json', '--read-only', '--max-iterations=1', '--json'])
    const parsed = JSON.parse(output) as {
      readonly command: string
      readonly status: string
      readonly goal: string
      readonly iterations: number
      readonly maxIterations: number
      readonly transcript: { readonly entries: readonly unknown[] }
    }

    expect(parsed.command).toBe('codemind runtime run')
    expect(parsed.status).toBe('iteration_limit')
    expect(parsed.goal).toBe('prepare json')
    expect(parsed.iterations).toBe(1)
    expect(parsed.maxIterations).toBe(1)
    expect(parsed.transcript.entries.length).toBeGreaterThan(0)
  })
})
