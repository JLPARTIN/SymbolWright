import { describe, expect, it } from 'vitest'

import { assertValidGoalPlan } from './goal-plan-validator.js'

describe('assertValidGoalPlan', () => {
  const validPlan = {
    goal: 'Implement feature X',
    steps: [
      { id: 'step-1', title: 'Read code', detail: 'Understand the codebase' },
      { id: 'step-2', title: 'Write code', detail: 'Implement changes', dependsOn: ['step-1'] },
    ],
  }

  it('accepts a valid plan', () => {
    expect(() => assertValidGoalPlan(validPlan)).not.toThrow()
  })

  it('accepts a plan with no steps', () => {
    expect(() => assertValidGoalPlan({ goal: 'Empty plan', steps: [] })).not.toThrow()
  })

  it('rejects null', () => {
    expect(() => assertValidGoalPlan(null)).toThrow('non-null object')
  })

  it('rejects non-object', () => {
    expect(() => assertValidGoalPlan(42)).toThrow('non-null object')
  })

  it('rejects empty goal', () => {
    expect(() => assertValidGoalPlan({ goal: '', steps: [] })).toThrow(
      'goal must be a non-empty string',
    )
  })

  it('rejects whitespace-only goal', () => {
    expect(() => assertValidGoalPlan({ goal: '   ', steps: [] })).toThrow(
      'goal must be a non-empty string',
    )
  })

  it('rejects non-array steps', () => {
    expect(() => assertValidGoalPlan({ goal: 'Test', steps: 'not-array' })).toThrow(
      'steps must be an array',
    )
  })

  it('rejects step with empty id', () => {
    expect(() =>
      assertValidGoalPlan({
        goal: 'Test',
        steps: [{ id: '', title: 'Step', detail: '' }],
      }),
    ).toThrow('id must be a non-empty string')
  })

  it('rejects step with empty title', () => {
    expect(() =>
      assertValidGoalPlan({
        goal: 'Test',
        steps: [{ id: 's1', title: '', detail: '' }],
      }),
    ).toThrow('title must be a non-empty string')
  })

  it('rejects step with non-string detail', () => {
    expect(() =>
      assertValidGoalPlan({
        goal: 'Test',
        steps: [{ id: 's1', title: 'Step', detail: 123 }],
      }),
    ).toThrow('detail must be a string')
  })

  it('rejects duplicate step ids', () => {
    expect(() =>
      assertValidGoalPlan({
        goal: 'Test',
        steps: [
          { id: 'dup', title: 'A', detail: '' },
          { id: 'dup', title: 'B', detail: '' },
        ],
      }),
    ).toThrow('Duplicate step id: dup')
  })

  it('rejects dependsOn referencing unknown step', () => {
    expect(() =>
      assertValidGoalPlan({
        goal: 'Test',
        steps: [{ id: 's1', title: 'A', detail: '', dependsOn: ['missing'] }],
      }),
    ).toThrow('depends on unknown step: missing')
  })

  it('rejects non-array dependsOn', () => {
    expect(() =>
      assertValidGoalPlan({
        goal: 'Test',
        steps: [{ id: 's1', title: 'A', detail: '', dependsOn: 'not-array' }],
      }),
    ).toThrow('dependsOn must be an array')
  })

  it('accepts steps without dependsOn', () => {
    expect(() =>
      assertValidGoalPlan({
        goal: 'Test',
        steps: [{ id: 's1', title: 'A', detail: 'detail text' }],
      }),
    ).not.toThrow()
  })
})
