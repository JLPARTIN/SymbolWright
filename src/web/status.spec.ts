import { describe, expect, it } from 'vitest'

import {
  buildRuntimeStatusView,
  classifyDoctor,
  classifyReleaseReadiness,
  combineStates,
  extractValue,
  type RuntimeState,
  type ScriptOutput,
} from './status.js'

describe('runtime status model', () => {
  function script(output: string, exitCode = 0): ScriptOutput {
    return { name: 'script', exitCode, output, durationMs: 12 }
  }

  it('extracts values with fallback handling', () => {
    expect(extractValue('Health: HEALTHY\n', /Health:\s*([^\n]+)/i)).toBe('HEALTHY')
    expect(extractValue('Health:   \n', /Health:\s*([^\n]*)/i, 'Fallback')).toBe('Fallback')
    expect(extractValue('nothing here', /Health:\s*([^\n]+)/i, 'Missing')).toBe('Missing')
  })

  it('classifies doctor health branches', () => {
    expect(classifyDoctor('Health: HEALTHY', 0)).toBe('pass')
    expect(classifyDoctor('Health: WARNINGS_PRESENT', 0)).toBe('warn')
    expect(classifyDoctor('Health: BLOCKED', 0)).toBe('fail')
    expect(classifyDoctor('Health: FAILED', 0)).toBe('fail')
    expect(classifyDoctor('Health: SOMETHING_ELSE', 0)).toBe('unknown')
    expect(classifyDoctor('Health: HEALTHY', 1)).toBe('fail')
  })

  it('classifies release-readiness outcome branches', () => {
    expect(classifyReleaseReadiness('Outcome: RELEASE_READY', 0)).toBe('pass')
    expect(classifyReleaseReadiness('Outcome: WARNINGS_PRESENT', 0)).toBe('warn')
    expect(classifyReleaseReadiness('Outcome: BLOCKED', 0)).toBe('fail')
    expect(classifyReleaseReadiness('Outcome: FAILED', 0)).toBe('fail')
    expect(classifyReleaseReadiness('Outcome: UNKNOWN_STATE', 0)).toBe('unknown')
    expect(classifyReleaseReadiness('Outcome: RELEASE_READY', 1)).toBe('fail')
  })

  it('combines state precedence deterministically', () => {
    const cases: readonly [readonly RuntimeState[], RuntimeState][] = [
      [['pass', 'fail'], 'fail'],
      [['pass', 'warn'], 'warn'],
      [['pass', 'pass'], 'pass'],
      [['pass', 'unknown'], 'unknown'],
      [[], 'pass'],
    ]

    for (const [states, expected] of cases) {
      expect(combineStates([...states])).toBe(expected)
    }
  })

  it('builds the aggregate runtime status view', () => {
    const doctor = script(`Health: HEALTHY
Runtime phases: complete
Tool registry: complete
Provider gateway: configured
Sandbox readiness: ready
Session directory: present
Project memory: ready`)
    const release = script('Outcome: RELEASE_READY')

    const view = buildRuntimeStatusView(doctor, release)

    expect(view.overallState).toBe('pass')
    expect(Number.isNaN(Date.parse(view.generatedAt))).toBe(false)
    expect(view.cards).toHaveLength(8)
    expect(view.cards.map((card) => card.label)).toContain('Project memory')
    expect(view.scripts).toEqual([doctor, release])
  })
})
