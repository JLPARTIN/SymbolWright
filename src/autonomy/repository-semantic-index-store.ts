import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { RepositorySemanticIndexSnapshot } from './repository-semantic-index.types.js'

export class RepositorySemanticIndexStore {
  public constructor(private readonly stateRoot: string) {}

  public async save(repositoryId: string, index: RepositorySemanticIndexSnapshot): Promise<string> {
    const targetPath = this.pathFor(repositoryId)
    const temporaryPath = `${targetPath}.${process.pid}.tmp`
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, targetPath)
    return targetPath
  }

  public async load(repositoryId: string): Promise<RepositorySemanticIndexSnapshot | undefined> {
    try {
      const content = await readFile(this.pathFor(repositoryId), 'utf8')
      const parsed = JSON.parse(content) as RepositorySemanticIndexSnapshot
      if (parsed.schemaVersion !== 1) {
        throw new Error(`Unsupported semantic index schema: ${String(parsed.schemaVersion)}`)
      }
      return parsed
    } catch (error) {
      if (isMissingFile(error)) return undefined
      throw error
    }
  }

  private pathFor(repositoryId: string): string {
    const safeId = repositoryId.replace(/[^A-Za-z0-9._-]/g, '_')
    return join(this.stateRoot, 'repository-indexes', `${safeId}.json`)
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
