import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { OperatorHistoryEntry } from './operator-types.js'

export class OperatorHistoryStore {
  constructor(private readonly filePath: string) {}

  static fromWorkspace(cwd: string): OperatorHistoryStore {
    return new OperatorHistoryStore(join(cwd, '.symbolwright', 'operator-history.jsonl'))
  }

  append(entry: OperatorHistoryEntry): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8')
  }

  list(limit = 25): OperatorHistoryEntry[] {
    if (!existsSync(this.filePath)) {
      return []
    }

    const lines = readFileSync(this.filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    return lines
      .map(parseHistoryEntry)
      .filter((entry): entry is OperatorHistoryEntry => entry !== undefined)
      .slice(-Math.max(1, limit))
  }

  clear(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, '', 'utf8')
  }
}

function parseHistoryEntry(line: string): OperatorHistoryEntry | undefined {
  try {
    const parsed: unknown = JSON.parse(line)
    if (!isHistoryEntry(parsed)) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

function isHistoryEntry(value: unknown): value is OperatorHistoryEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  const kind = candidate['kind']
  return (
    typeof candidate['timestamp'] === 'string' &&
    typeof candidate['input'] === 'string' &&
    (kind === 'invalid' || kind === 'mission' || kind === 'slash')
  )
}
