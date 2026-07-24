import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { WebSearchProvider } from '../web/web-search-provider.js'
import type { RepositoryPortabilityProfile } from './repository-portability.js'
import { researchRepositoryPortability } from './repository-portability-research.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('repository portability research', () => {
  it('records policy-gated search evidence as advisory guidance only', async () => {
    const root = await temporaryRoot('codemind-portability-research-')
    const search = vi.fn<WebSearchProvider['search']>(async () => ({
      outcome: 'ok',
      results: [
        {
          title: 'Official Zig Build System',
          url: 'https://ziglang.org/learn/build-system/',
          snippet: 'Use zig build test for projects configured with build.zig.',
        },
      ],
    }))
    const provider: WebSearchProvider = { name: 'fixture-search', search }

    const result = await researchRepositoryPortability({
      repositoryRoot: root,
      profile: unknownProfile(root),
      runtimePolicy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
      provider,
    })

    expect(search).toHaveBeenCalledOnce()
    expect(result.queries).toEqual(['Official Zig build test lint commands'])
    expect(result.evidence[0]?.status).toBe('ok')
    expect(result.guidance).toEqual([
      'Official Zig Build System: Use zig build test for projects configured with build.zig. (https://ziglang.org/learn/build-system/)',
    ])
    expect(result).not.toHaveProperty('validationCommands')
  })

  it('returns blocked evidence without calling a provider when network policy forbids research', async () => {
    const root = await temporaryRoot('codemind-portability-research-blocked-')
    const search = vi.fn<WebSearchProvider['search']>()
    const provider: WebSearchProvider = { name: 'fixture-search', search }
    const runtimePolicy = {
      ...createRuntimePolicyForMode('APPROVED_EXECUTION'),
      allowReadOnlyNetwork: false,
    }

    const result = await researchRepositoryPortability({
      repositoryRoot: root,
      profile: unknownProfile(root),
      runtimePolicy,
      provider,
    })

    expect(search).not.toHaveBeenCalled()
    expect(result.evidence[0]?.status).toBe('blocked')
    expect(result.guidance).toEqual([])
  })
})

function unknownProfile(repositoryRoot: string): RepositoryPortabilityProfile {
  return {
    schemaVersion: 1,
    repositoryRoot,
    ecosystems: ['unknown'],
    primaryEcosystem: 'unknown',
    mixed: false,
    manifests: ['build.zig'],
    validation: [],
    validationCommands: [],
    confidence: 'low',
    researchQueries: ['Official Zig build test lint commands'],
    evidence: ['No supported local toolchain manifest was identified.'],
  }
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}
