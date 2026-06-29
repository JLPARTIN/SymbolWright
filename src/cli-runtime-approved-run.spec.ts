import { describe, expect, it } from 'vitest'

import { renderApprovedRuntimeRun } from './cli-runtime-approved-run.js'

describe('renderApprovedRuntimeRun', () => {
  it('hard-fails with migration guidance', async () => {
    await expect(renderApprovedRuntimeRun()).rejects.toThrow('runtime path has been retired')
  })
})
