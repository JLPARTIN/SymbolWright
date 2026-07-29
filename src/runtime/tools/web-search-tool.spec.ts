import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
import type { RuntimeToolContext } from '../types.js'
import { executeWebSearchTool, webSearchTool } from './web-search-tool.js'

describe('web-search-tool', () => {
  let workspaceDir: string

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'symbolwright-web-search-tool-'))
  })

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true })
  })

  function contextFor(mode: 'APPROVED_EXECUTION' | 'READ_ONLY'): RuntimeToolContext {
    return { cwd: workspaceDir, policy: createRuntimePolicyForMode(mode) }
  }

  it('is registered with the web_search name and WEB_ACCESS capability', () => {
    expect(webSearchTool.name).toBe('web_search')
    expect(webSearchTool.capability).toBe('WEB_ACCESS')
  })

  it('blocks disabled search config and renders the reason', async () => {
    mkdirSync(join(workspaceDir, '.symbolwright'), { recursive: true })
    writeFileSync(
      join(workspaceDir, '.symbolwright', 'config.json'),
      JSON.stringify({ web: { search: { enabled: false } } }),
    )

    const output = await executeWebSearchTool({ query: 'vitest' }, contextFor('APPROVED_EXECUTION'))
    expect(output).toContain('Status: blocked')
    expect(output).toContain('web.search.enabled is false')
  })

  it('denies delegated callers so direct research network cannot bypass brokered egress', async () => {
    const delegated: RuntimeToolContext = {
      ...contextFor('APPROVED_EXECUTION'),
      accessControl: {
        principalId: 'principal-1',
        grantId: 'grant-1',
        requireAuthorized: async () => undefined,
      },
    }
    await expect(executeWebSearchTool({ query: 'vitest' }, delegated)).rejects.toThrow(
      /BROKERED_EGRESS_REQUIRED/,
    )
  })

  it('rejects missing query before touching the network', async () => {
    await expect(webSearchTool.execute({}, contextFor('APPROVED_EXECUTION'))).rejects.toThrow(
      /non-empty "query"/,
    )
  })

  it('rejects a non-object input', async () => {
    await expect(webSearchTool.execute(42, contextFor('APPROVED_EXECUTION'))).rejects.toThrow(
      /requires an object input/,
    )
  })

  it('reports status=blocked when web.mode is off', async () => {
    mkdirSync(join(workspaceDir, '.symbolwright'), { recursive: true })
    writeFileSync(
      join(workspaceDir, '.symbolwright', 'config.json'),
      JSON.stringify({ web: { mode: 'off' } }),
    )

    const output = await executeWebSearchTool({ query: 'vitest' }, contextFor('APPROVED_EXECUTION'))
    expect(output).toContain('Status: blocked')
  })
})
