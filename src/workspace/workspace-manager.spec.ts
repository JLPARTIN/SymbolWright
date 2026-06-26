import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { WorkspaceManager } from './workspace-manager.js'

const TEST_BASE = join(process.cwd(), '.test-workspace')
const REPO_A = join(TEST_BASE, 'repo-a')
const REPO_B = join(TEST_BASE, 'repo-b')

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager

  beforeEach(() => {
    if (existsSync(TEST_BASE)) {
      rmSync(TEST_BASE, { recursive: true })
    }
    mkdirSync(REPO_A, { recursive: true })
    mkdirSync(REPO_B, { recursive: true })
    manager = new WorkspaceManager()
  })

  afterEach(() => {
    if (existsSync(TEST_BASE)) {
      rmSync(TEST_BASE, { recursive: true })
    }
  })

  it('starts empty', () => {
    expect(manager.size()).toBe(0)
    expect(manager.getPrimary()).toBeUndefined()
  })

  it('adds a repository', () => {
    const repo = manager.add(REPO_A)
    expect(repo.rootPath).toBe(resolve(REPO_A))
    expect(repo.displayName).toBe('repo-a')
    expect(repo.id).toBeTruthy()
    expect(manager.size()).toBe(1)
  })

  it('first added repo becomes primary', () => {
    manager.add(REPO_A)
    expect(manager.getPrimary()!.rootPath).toBe(resolve(REPO_A))
  })

  it('uses custom display name', () => {
    const repo = manager.add(REPO_A, 'My Project')
    expect(repo.displayName).toBe('My Project')
  })

  it('throws on non-existent path', () => {
    expect(() => manager.add('/nonexistent/path')).toThrow('does not exist')
  })

  it('throws on file path', async () => {
    const { writeFileSync } = await import('node:fs')
    const filePath = join(TEST_BASE, 'not-a-dir.txt')
    writeFileSync(filePath, 'hello')
    expect(() => manager.add(filePath)).toThrow('not a directory')
  })

  it('returns existing repo for duplicate path', () => {
    const r1 = manager.add(REPO_A)
    const r2 = manager.add(REPO_A)
    expect(r2.id).toBe(r1.id)
    expect(manager.size()).toBe(1)
  })

  it('adds multiple repos', () => {
    manager.add(REPO_A)
    manager.add(REPO_B)
    expect(manager.size()).toBe(2)
  })

  it('removes a repository', () => {
    const repo = manager.add(REPO_A)
    expect(manager.remove(repo.id)).toBe(true)
    expect(manager.size()).toBe(0)
  })

  it('remove returns false for unknown id', () => {
    expect(manager.remove('nonexistent')).toBe(false)
  })

  it('updates primary when primary is removed', () => {
    const r1 = manager.add(REPO_A)
    manager.add(REPO_B)
    manager.remove(r1.id)
    expect(manager.getPrimary()).toBeDefined()
    expect(manager.getPrimary()!.rootPath).toBe(resolve(REPO_B))
  })

  it('setPrimary changes the primary repo', () => {
    manager.add(REPO_A)
    const r2 = manager.add(REPO_B)
    manager.setPrimary(r2.id)
    expect(manager.getPrimary()!.id).toBe(r2.id)
  })

  it('setPrimary returns false for unknown id', () => {
    expect(manager.setPrimary('nonexistent')).toBe(false)
  })

  it('get retrieves a repo by id', () => {
    const repo = manager.add(REPO_A)
    expect(manager.get(repo.id)).toEqual(repo)
    expect(manager.get('missing')).toBeUndefined()
  })

  it('list returns all repos', () => {
    manager.add(REPO_A)
    manager.add(REPO_B)
    const list = manager.list()
    expect(list).toHaveLength(2)
  })

  it('findByPath finds repo by resolved path', () => {
    const repo = manager.add(REPO_A)
    expect(manager.findByPath(REPO_A)!.id).toBe(repo.id)
    expect(manager.findByPath('/nonexistent')).toBeUndefined()
  })

  it('isFileInWorkspace detects files inside repos', () => {
    manager.add(REPO_A)
    expect(manager.isFileInWorkspace(join(REPO_A, 'src', 'index.ts'))).toBe(true)
    expect(manager.isFileInWorkspace('/outside/file.ts')).toBe(false)
  })

  it('getRepoForFile returns the containing repo', () => {
    manager.add(REPO_A)
    manager.add(REPO_B)
    const repo = manager.getRepoForFile(join(REPO_B, 'src', 'app.ts'))
    expect(repo!.rootPath).toBe(resolve(REPO_B))
  })

  it('getRepoForFile returns undefined for outside files', () => {
    manager.add(REPO_A)
    expect(manager.getRepoForFile('/outside/file.ts')).toBeUndefined()
  })

  it('serializes to and from config', () => {
    const r1 = manager.add(REPO_A)
    manager.add(REPO_B)
    const config = manager.toConfig()

    expect(config.primaryRepo).toBe(r1.id)
    expect(config.repos).toHaveLength(2)

    const restored = WorkspaceManager.fromConfig(config)
    expect(restored.size()).toBe(2)
    expect(restored.getPrimary()!.id).toBe(r1.id)
  })

  it('fromConfig handles empty primary', () => {
    const restored = WorkspaceManager.fromConfig({ primaryRepo: '', repos: [] })
    expect(restored.size()).toBe(0)
    expect(restored.getPrimary()).toBeUndefined()
  })
})
