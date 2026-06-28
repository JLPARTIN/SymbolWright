import { describe, expect, it } from 'vitest'

import { applyPatchTool } from './apply-patch-tool.js'
import { createFixtureRegistry } from '../registry/fixture-registry-factory.js'

describe('applyPatchTool', () => {
  it('has expected metadata', () => {
    expect(applyPatchTool.name).toBe('apply_patch')
    expect(applyPatchTool.capability).toBe('PATCH_APPLICATION')
  })

  it('is registered by the patch application registry', () => {
    const registry = createFixtureRegistry('patch_application')

    expect(registry.has('apply_patch')).toBe(true)
    expect(registry.has('local_file_write')).toBe(true)
  })

  it('rejects missing input', async () => {
    await expect(
      applyPatchTool.execute(null, {
        cwd: '/workspace',
        policy: {
          mode: 'READ_ONLY',
          allowNetwork: false,
          allowShell: false,
          allowWrites: false,
          allowGitHubWrites: false,
          protectedPaths: [],
          noisyDirs: [],
        },
      }),
    ).rejects.toThrow('Missing apply patch input')
  })
})
