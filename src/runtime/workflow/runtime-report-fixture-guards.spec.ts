import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  assertRecord,
  loadFixtureFile,
  parseFixtureFormat,
  parseFixtureGeneratedAt,
  parseFixtureTitle,
  parseOptionalArray,
  parseOptionalRecord,
} from './runtime-report-fixture-guards.js'

describe('assertRecord', () => {
  it('passes for a plain object', () => {
    expect(() => assertRecord({}, 'fail')).not.toThrow()
  })

  it('rejects null', () => {
    expect(() => assertRecord(null, 'must be object')).toThrow('must be object')
  })

  it('rejects a string', () => {
    expect(() => assertRecord('text', 'must be object')).toThrow('must be object')
  })

  it('rejects a number', () => {
    expect(() => assertRecord(42, 'must be object')).toThrow('must be object')
  })

  it('rejects undefined', () => {
    expect(() => assertRecord(undefined, 'must be object')).toThrow('must be object')
  })

  it('rejects a boolean', () => {
    expect(() => assertRecord(true, 'must be object')).toThrow('must be object')
  })
})

describe('parseFixtureFormat', () => {
  it('accepts markdown', () => {
    expect(parseFixtureFormat('markdown')).toBe('markdown')
  })

  it('accepts json', () => {
    expect(parseFixtureFormat('json')).toBe('json')
  })

  it('rejects xml', () => {
    expect(() => parseFixtureFormat('xml')).toThrow('Fixture format must be "markdown" or "json".')
  })

  it('rejects undefined', () => {
    expect(() => parseFixtureFormat(undefined)).toThrow('Fixture format must be "markdown" or "json".')
  })

  it('rejects a number', () => {
    expect(() => parseFixtureFormat(123)).toThrow('Fixture format must be "markdown" or "json".')
  })
})

describe('parseOptionalArray', () => {
  it('returns undefined for undefined input', () => {
    expect(parseOptionalArray(undefined, 'items')).toBeUndefined()
  })

  it('parses a valid array of objects', () => {
    const result = parseOptionalArray([{ a: 1 }, { b: 2 }], 'items')
    expect(result).toHaveLength(2)
  })

  it('rejects a non-array value', () => {
    expect(() => parseOptionalArray('bad', 'items')).toThrow(
      'Fixture "items" field must be an array when supplied.',
    )
  })

  it('rejects a non-object item in the array', () => {
    expect(() => parseOptionalArray([42], 'items')).toThrow(
      'Fixture items item 1 must be an object.',
    )
  })

  it('rejects null item in the array', () => {
    expect(() => parseOptionalArray([null], 'entries')).toThrow(
      'Fixture entries item 1 must be an object.',
    )
  })

  it('reports correct index for bad item', () => {
    expect(() => parseOptionalArray([{}, {}, 'bad'], 'things')).toThrow(
      'Fixture things item 3 must be an object.',
    )
  })
})

describe('parseOptionalRecord', () => {
  it('returns undefined for undefined input', () => {
    expect(parseOptionalRecord(undefined, 'catalog')).toBeUndefined()
  })

  it('parses a valid object', () => {
    const result = parseOptionalRecord({ key: 'value' }, 'catalog')
    expect(result).toEqual({ key: 'value' })
  })

  it('rejects a non-object value', () => {
    expect(() => parseOptionalRecord('bad', 'catalog')).toThrow(
      'Fixture "catalog" field must be an object when supplied.',
    )
  })

  it('rejects null', () => {
    expect(() => parseOptionalRecord(null, 'suite')).toThrow(
      'Fixture "suite" field must be an object when supplied.',
    )
  })
})

describe('parseFixtureTitle', () => {
  it('parses a valid title', () => {
    expect(parseFixtureTitle({ title: 'My Report' })).toBe('My Report')
  })

  it('rejects an empty string', () => {
    expect(() => parseFixtureTitle({ title: '' })).toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })

  it('rejects a whitespace-only string', () => {
    expect(() => parseFixtureTitle({ title: '   ' })).toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })

  it('rejects a missing title', () => {
    expect(() => parseFixtureTitle({})).toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })

  it('rejects a numeric title', () => {
    expect(() => parseFixtureTitle({ title: 42 })).toThrow(
      'Fixture must include a non-empty "title" field.',
    )
  })
})

describe('parseFixtureGeneratedAt', () => {
  it('returns a valid string', () => {
    expect(parseFixtureGeneratedAt({ generatedAt: '2026-01-01T00:00:00.000Z' }))
      .toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns undefined when field is missing', () => {
    expect(parseFixtureGeneratedAt({})).toBeUndefined()
  })

  it('rejects a numeric value', () => {
    expect(() => parseFixtureGeneratedAt({ generatedAt: 12345 })).toThrow(
      'Fixture "generatedAt" field must be a string when supplied.',
    )
  })

  it('rejects a boolean value', () => {
    expect(() => parseFixtureGeneratedAt({ generatedAt: true })).toThrow(
      'Fixture "generatedAt" field must be a string when supplied.',
    )
  })
})

describe('loadFixtureFile', () => {
  it('loads valid JSON from a file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-guard-test-'))
    const filePath = path.join(dir, 'fixture.json')
    fs.writeFileSync(filePath, JSON.stringify({ title: 'Test' }), 'utf8')

    const result = loadFixtureFile(filePath) as { readonly title: string }
    expect(result.title).toBe('Test')
  })

  it('throws on invalid JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-guard-test-'))
    const filePath = path.join(dir, 'bad.json')
    fs.writeFileSync(filePath, 'not json', 'utf8')

    expect(() => loadFixtureFile(filePath)).toThrow()
  })

  it('throws on missing file', () => {
    expect(() => loadFixtureFile('/nonexistent/path.json')).toThrow()
  })
})
