import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DEFAULT_PROCEDURES_PATH = resolve(process.cwd(), '.symbolwright/memory/procedures.yaml')

export interface ProceduralSchema {
  readonly user_preferences: readonly string[]
  readonly repo_conventions: readonly string[]
}

type ProceduralCategory = keyof ProceduralSchema

const PROCEDURAL_CATEGORIES: readonly ProceduralCategory[] = [
  'user_preferences',
  'repo_conventions',
]

export class ProceduralMemory {
  private data: ProceduralSchema

  constructor(private readonly filePath: string = DEFAULT_PROCEDURES_PATH) {
    this.data = this.load()
    this.save()
  }

  public getAllRules(): readonly string[] {
    return [...this.data.user_preferences, ...this.data.repo_conventions]
  }

  /** Read-only per-category view, for browsing rather than prompt-building. */
  public getSchema(): ProceduralSchema {
    return { ...this.data }
  }

  public addRule(category: ProceduralCategory, rule: string): void {
    const current = [...this.data[category]]
    if (current.includes(rule)) return

    this.data = {
      ...this.data,
      [category]: [...current, rule],
    }
    this.save()
  }

  public removeRule(category: ProceduralCategory, rule: string): void {
    this.data = {
      ...this.data,
      [category]: this.data[category].filter((entry) => entry !== rule),
    }
    this.save()
  }

  private load(): ProceduralSchema {
    if (!existsSync(this.filePath)) return emptyProcedures()

    try {
      return parseProcedures(readFileSync(this.filePath, 'utf-8'))
    } catch {
      return emptyProcedures()
    }
  }

  private save(): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(this.filePath, serializeProcedures(this.data))
  }
}

function emptyProcedures(): ProceduralSchema {
  return {
    user_preferences: [],
    repo_conventions: [],
  }
}

function parseProcedures(raw: string): ProceduralSchema {
  const result: Record<ProceduralCategory, string[]> = {
    user_preferences: [],
    repo_conventions: [],
  }
  let currentCategory: ProceduralCategory | undefined

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue

    const section = PROCEDURAL_CATEGORIES.find((category) => trimmed === `${category}:`)
    if (section !== undefined) {
      currentCategory = section
      continue
    }

    if (currentCategory !== undefined && trimmed.startsWith('- ')) {
      result[currentCategory].push(parseYamlListValue(trimmed.slice(2)))
      continue
    }

    return emptyProcedures()
  }

  return result
}

function parseYamlListValue(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) return ''

  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return typeof parsed === 'string' ? parsed : trimmed
    } catch {
      return trimmed
    }
  }

  return trimmed
}

function serializeProcedures(schema: ProceduralSchema): string {
  return [
    'user_preferences:',
    ...schema.user_preferences.map((rule) => `  - ${JSON.stringify(rule)}`),
    'repo_conventions:',
    ...schema.repo_conventions.map((rule) => `  - ${JSON.stringify(rule)}`),
    '',
  ].join('\n')
}
