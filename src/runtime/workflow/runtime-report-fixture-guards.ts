import fs from 'node:fs'

export function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(message)
  }
}

export function parseFixtureFormat(value: unknown): 'markdown' | 'json' {
  if (value === 'markdown' || value === 'json') {
    return value
  }

  throw new Error('Fixture format must be "markdown" or "json".')
}

export function parseOptionalArray<T>(value: unknown, name: string): readonly T[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    throw new Error(`Fixture "${name}" field must be an array when supplied.`)
  }

  return value.map((item, index) => {
    assertRecord(item, `Fixture ${name} item ${index + 1} must be an object.`)
    return item as unknown as T
  })
}

export function parseOptionalRecord<T>(value: unknown, name: string): T | undefined {
  if (value === undefined) {
    return undefined
  }

  assertRecord(value, `Fixture "${name}" field must be an object when supplied.`)
  return value as unknown as T
}

export function parseFixtureTitle(raw: Record<string, unknown>): string {
  const title = raw['title']
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Fixture must include a non-empty "title" field.')
  }

  return title
}

export function parseFixtureGeneratedAt(raw: Record<string, unknown>): string | undefined {
  const generatedAt = raw['generatedAt']
  if (generatedAt !== undefined && typeof generatedAt !== 'string') {
    throw new Error('Fixture "generatedAt" field must be a string when supplied.')
  }

  return generatedAt
}

export function loadFixtureFile(fixturePath: string): unknown {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as unknown
}
