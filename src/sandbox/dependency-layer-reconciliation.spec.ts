import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  DependencyLayerBindingStore,
  DependencyLayerBindingSummary,
} from './dependency-layer-binding-store.js'
import { reconcileDependencyLayers } from './dependency-layer-reconciliation.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-layer-reconcile-'))
  roots.push(root)
  return root
}

function fakeBindingStore(
  summaries: readonly DependencyLayerBindingSummary[],
): DependencyLayerBindingStore {
  return { listBindings: vi.fn(async () => summaries) } as unknown as DependencyLayerBindingStore
}

describe('reconcileDependencyLayers', () => {
  it('returns bindings and zero removals when the layers directory does not exist yet', async () => {
    const stateRoot = await temporaryRoot()
    const bindings: readonly DependencyLayerBindingSummary[] = [
      { layerId: 'layer-1', boundAt: '2026-07-30T00:00:00.000Z', status: 'valid' },
    ]

    const result = await reconcileDependencyLayers({
      stateRoot,
      bindingStore: fakeBindingStore(bindings),
    })

    expect(result).toEqual({ bindings, orphanedTempDirsRemoved: 0, orphanedTempDirsSkipped: 0 })
  })

  it('removes an orphaned staging directory older than the minimum age', async () => {
    const stateRoot = await temporaryRoot()
    const layersRoot = path.join(stateRoot, 'layers')
    const orphan = path.join(layersRoot, '.layer-1-tmp-abc123')
    await fs.mkdir(orphan, { recursive: true })

    const result = await reconcileDependencyLayers({
      stateRoot,
      bindingStore: fakeBindingStore([]),
      minOrphanAgeMs: 0,
    })

    expect(result.orphanedTempDirsRemoved).toBe(1)
    await expect(fs.stat(orphan)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never removes a staging directory younger than the minimum age, so an in-flight materialization is never raced', async () => {
    const stateRoot = await temporaryRoot()
    const layersRoot = path.join(stateRoot, 'layers')
    const inFlight = path.join(layersRoot, '.layer-2-tmp-def456')
    await fs.mkdir(inFlight, { recursive: true })

    const result = await reconcileDependencyLayers({
      stateRoot,
      bindingStore: fakeBindingStore([]),
      minOrphanAgeMs: 60 * 60 * 1000,
    })

    expect(result.orphanedTempDirsRemoved).toBe(0)
    expect(result.orphanedTempDirsSkipped).toBe(1)
    await expect(fs.stat(inFlight)).resolves.toBeDefined()
  })

  it('never removes a real materialized layer directory, only entries matching the staging-dir naming pattern', async () => {
    const stateRoot = await temporaryRoot()
    const layersRoot = path.join(stateRoot, 'layers')
    const realLayer = path.join(layersRoot, 'layer-1')
    await fs.mkdir(realLayer, { recursive: true })

    const result = await reconcileDependencyLayers({
      stateRoot,
      bindingStore: fakeBindingStore([]),
      minOrphanAgeMs: 0,
    })

    expect(result.orphanedTempDirsRemoved).toBe(0)
    await expect(fs.stat(realLayer)).resolves.toBeDefined()
  })

  it('bounds removals per pass via maxRemovals, deferring the rest to a future sweep', async () => {
    const stateRoot = await temporaryRoot()
    const layersRoot = path.join(stateRoot, 'layers')
    await fs.mkdir(layersRoot, { recursive: true })
    for (let i = 0; i < 3; i += 1) {
      await fs.mkdir(path.join(layersRoot, `.layer-${i}-tmp-x`), { recursive: true })
    }

    const result = await reconcileDependencyLayers({
      stateRoot,
      bindingStore: fakeBindingStore([]),
      minOrphanAgeMs: 0,
      maxRemovals: 2,
    })

    expect(result.orphanedTempDirsRemoved).toBe(2)
    expect(result.orphanedTempDirsSkipped).toBe(1)
  })

  it('is idempotent -- a second pass over already-reconciled state removes nothing further', async () => {
    const stateRoot = await temporaryRoot()
    const layersRoot = path.join(stateRoot, 'layers')
    await fs.mkdir(path.join(layersRoot, '.layer-1-tmp-abc'), { recursive: true })

    const first = await reconcileDependencyLayers({
      stateRoot,
      bindingStore: fakeBindingStore([]),
      minOrphanAgeMs: 0,
    })
    const second = await reconcileDependencyLayers({
      stateRoot,
      bindingStore: fakeBindingStore([]),
      minOrphanAgeMs: 0,
    })

    expect(first.orphanedTempDirsRemoved).toBe(1)
    expect(second.orphanedTempDirsRemoved).toBe(0)
  })
})
