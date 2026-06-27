import { existsSync, statSync } from 'node:fs'
import { resolve, basename } from 'node:path'

/** A registered workspace repository with identity and path. */
export interface WorkspaceRepo {
  readonly id: string
  readonly rootPath: string
  readonly displayName: string
  readonly addedAt: string
}

/** Serializable workspace configuration with primary repo and repo list. */
export interface WorkspaceConfig {
  readonly primaryRepo: string
  readonly repos: readonly WorkspaceRepo[]
}

/** Manages multi-repo workspaces with primary selection and file lookups. */
export class WorkspaceManager {
  private readonly repos = new Map<string, WorkspaceRepo>()
  private primaryRepoId: string | undefined

  add(rootPath: string, displayName?: string): WorkspaceRepo {
    const resolved = resolve(rootPath)

    if (!existsSync(resolved)) {
      throw new Error(`Path does not exist: ${resolved}`)
    }

    const stat = statSync(resolved)
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolved}`)
    }

    const existing = this.findByPath(resolved)
    if (existing !== undefined) {
      return existing
    }

    const id = `repo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    const repo: WorkspaceRepo = {
      id,
      rootPath: resolved,
      displayName: displayName ?? basename(resolved),
      addedAt: new Date().toISOString(),
    }

    this.repos.set(id, repo)

    if (this.primaryRepoId === undefined) {
      this.primaryRepoId = id
    }

    return repo
  }

  remove(id: string): boolean {
    const existed = this.repos.delete(id)

    if (existed && this.primaryRepoId === id) {
      const first = this.repos.keys().next()
      this.primaryRepoId = first.done ? undefined : first.value
    }

    return existed
  }

  setPrimary(id: string): boolean {
    if (!this.repos.has(id)) return false
    this.primaryRepoId = id
    return true
  }

  getPrimary(): WorkspaceRepo | undefined {
    if (this.primaryRepoId === undefined) return undefined
    return this.repos.get(this.primaryRepoId)
  }

  get(id: string): WorkspaceRepo | undefined {
    return this.repos.get(id)
  }

  list(): readonly WorkspaceRepo[] {
    return [...this.repos.values()]
  }

  size(): number {
    return this.repos.size
  }

  findByPath(rootPath: string): WorkspaceRepo | undefined {
    const resolved = resolve(rootPath)
    for (const repo of this.repos.values()) {
      if (repo.rootPath === resolved) {
        return repo
      }
    }
    return undefined
  }

  isFileInWorkspace(filePath: string): boolean {
    const resolved = resolve(filePath)
    for (const repo of this.repos.values()) {
      if (resolved.startsWith(repo.rootPath + '/') || resolved === repo.rootPath) {
        return true
      }
    }
    return false
  }

  getRepoForFile(filePath: string): WorkspaceRepo | undefined {
    const resolved = resolve(filePath)
    let best: WorkspaceRepo | undefined
    let bestLen = 0

    for (const repo of this.repos.values()) {
      if ((resolved.startsWith(repo.rootPath + '/') || resolved === repo.rootPath) && repo.rootPath.length > bestLen) {
        best = repo
        bestLen = repo.rootPath.length
      }
    }

    return best
  }

  toConfig(): WorkspaceConfig {
    return {
      primaryRepo: this.primaryRepoId ?? '',
      repos: this.list(),
    }
  }

  static fromConfig(config: WorkspaceConfig): WorkspaceManager {
    const manager = new WorkspaceManager()

    for (const repo of config.repos) {
      manager.repos.set(repo.id, repo)
    }

    if (config.primaryRepo.length > 0 && manager.repos.has(config.primaryRepo)) {
      manager.primaryRepoId = config.primaryRepo
    } else {
      const first = manager.repos.keys().next()
      manager.primaryRepoId = first.done ? undefined : first.value
    }

    return manager
  }
}
