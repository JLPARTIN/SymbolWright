import { describe, expect, it } from 'vitest'

import { joinOperatorArgs, parseOperatorInput, splitOperatorArgs } from './operator-input-parser.js'

describe('parseOperatorInput', () => {
  it('parses empty input', () => {
    expect(parseOperatorInput('   ')).toEqual({ kind: 'empty', raw: '   ' })
  })

  it('treats plain text as a mission', () => {
    expect(parseOperatorInput('inspect this repo')).toEqual({
      kind: 'mission',
      raw: 'inspect this repo',
      goal: 'inspect this repo',
    })
  })

  it('parses known slash commands', () => {
    expect(parseOperatorInput('/read README.md')).toEqual({
      kind: 'slash',
      raw: '/read README.md',
      command: 'read',
      args: ['README.md'],
    })
  })

  it('maps aliases to canonical commands', () => {
    expect(parseOperatorInput('/runtime')).toEqual({
      kind: 'slash',
      raw: '/runtime',
      command: 'runtime-status',
      args: [],
    })
  })

  it('rejects unknown slash commands', () => {
    expect(parseOperatorInput('/unknown')).toEqual({
      kind: 'invalid',
      raw: '/unknown',
      error: 'Unknown operator command: /unknown',
    })
  })
})

describe('operator arg helpers', () => {
  it('splits command arguments by spaces', () => {
    expect(splitOperatorArgs('/plan improve docs')).toEqual(['/plan', 'improve', 'docs'])
  })

  it('joins command arguments into mission text', () => {
    expect(joinOperatorArgs(['improve', 'docs'])).toBe('improve docs')
  })
})
