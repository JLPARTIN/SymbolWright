import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface JsonlStoreOptions {
  readonly filePath: string
  readonly createIfMissing?: boolean
}

export class JsonlStore<T> {
  private readonly filePath: string

  constructor(options: JsonlStoreOptions) {
    this.filePath = options.filePath
    if (options.createIfMissing !== false) {
      this.ensureDirectory()
    }
  }

  append(record: T): void {
    this.ensureDirectory()
    appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf-8')
  }

  appendAll(records: readonly T[]): void {
    if (records.length === 0) return
    this.ensureDirectory()
    const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n'
    appendFileSync(this.filePath, content, 'utf-8')
  }

  readAll(): readonly T[] {
    if (!existsSync(this.filePath)) return []

    const content = readFileSync(this.filePath, 'utf-8')
    const lines = content.split('\n').filter((line) => line.trim().length > 0)
    const results: T[] = []

    for (const line of lines) {
      try {
        results.push(JSON.parse(line) as T)
      } catch {
        // skip malformed lines
      }
    }

    return results
  }

  readFiltered(predicate: (record: T) => boolean): readonly T[] {
    return this.readAll().filter(predicate)
  }

  count(): number {
    if (!existsSync(this.filePath)) return 0

    const content = readFileSync(this.filePath, 'utf-8')
    return content.split('\n').filter((line) => line.trim().length > 0).length
  }

  clear(): void {
    if (existsSync(this.filePath)) {
      writeFileSync(this.filePath, '', 'utf-8')
    }
  }

  exists(): boolean {
    return existsSync(this.filePath)
  }

  getFilePath(): string {
    return this.filePath
  }

  private ensureDirectory(): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}
