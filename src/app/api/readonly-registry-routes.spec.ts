import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bridgeToolsForProvider } from '../../agent/tool-schema-bridge.js'
import { createCheckpoint } from '../../checkpoint/checkpoint-service.js'
import { createRuntimePolicyForMode } from '../../runtime/policy/runtime-policy.js'
import { assembleAgentTools } from '../../runtime/tools/tool-assembly.js'
import { startChatServer, type StartedChatServer } from '../../server/codemind-chat-server.js'
import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'

const API_KEY = 'test-codemind-key'

let started: StartedChatServer | undefined
let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'codemind-readonly-registry-'))
})

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
  rmSync(cwd, { recursive: true, force: true })
})

async function launch() {
  started = await startChatServer({
    apiKey: API_KEY,
    host: '127.0.0.1',
    port: 0,
    env: {},
    cwd,
    rateLimiter: new UnlimitedRateLimiter(),
  })
  return started
}

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}` }
}

describe('GET /api/tools', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/tools`)
    expect(response.status).toBe(401)
  })

  it('reports static/dynamic tools and per-mode reachability matching bridgeToolsForProvider directly', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/tools`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      staticTools: readonly { name: string }[]
      dynamicTools: readonly { name: string }[]
      modes: Record<string, readonly string[]>
    }

    expect(body.staticTools.length).toBe(assembleAgentTools().length)
    expect(body.dynamicTools).toEqual([
      { name: 'plan_goal' },
      { name: 'github_live_read_pr' },
      { name: 'github_live_read_ci' },
      { name: 'ajna_live_read_review' },
      { name: 'ajna_live_read_merge_readiness' },
    ])

    for (const mode of ['READ_ONLY', 'PROPOSAL_ONLY', 'APPROVED_EXECUTION'] as const) {
      const policy = createRuntimePolicyForMode(mode, { hasGitHubToken: false })
      const expected = bridgeToolsForProvider(assembleAgentTools(), policy).map(
        (bridged) => bridged.providerTool.name,
      )
      expect(body.modes[mode]).toEqual(expected)
    }
  })
})

describe('GET /api/checkpoints', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/checkpoints`)
    expect(response.status).toBe(401)
  })

  it('lists checkpoints created in the workspace and fetches one by id', async () => {
    const metadata = createCheckpoint({
      workspaceRoot: cwd,
      sessionId: 'cm-test',
      tool: 'edit_file',
      files: [
        {
          targetPath: 'a.ts',
          resolvedPath: join(cwd, 'a.ts'),
          existedBefore: true,
          originalContent: 'const a = 1',
        },
      ],
    })

    const server = await launch()
    const listResponse = await fetch(`${server.url}/api/checkpoints`, { headers: auth() })
    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as {
      checkpoints: readonly { checkpointId: string }[]
    }
    expect(listBody.checkpoints.map((c) => c.checkpointId)).toContain(metadata.checkpointId)

    const detailResponse = await fetch(`${server.url}/api/checkpoints/${metadata.checkpointId}`, {
      headers: auth(),
    })
    expect(detailResponse.status).toBe(200)
    const detailBody = (await detailResponse.json()) as { checkpoint: { checkpointId: string } }
    expect(detailBody.checkpoint.checkpointId).toBe(metadata.checkpointId)
  })

  it('returns 404 for an unknown checkpoint id', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/checkpoints/does-not-exist`, {
      headers: auth(),
    })
    expect(response.status).toBe(404)
  })
})

describe('GET /api/memory/recent', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/memory/recent`)
    expect(response.status).toBe(401)
  })

  it('returns an empty list with a note when no memory database exists yet', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/memory/recent`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { interactions: readonly unknown[]; note?: string }
    expect(body.interactions).toEqual([])
    expect(body.note).toBe('No local memory database yet — created on first agent session.')
  })
})

describe('GET /api/memory/procedural', () => {
  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/memory/procedural`)
    expect(response.status).toBe(401)
  })

  it('returns empty categories on a fresh checkout', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/memory/procedural`, { headers: auth() })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { categories: readonly { category: string }[] }
    expect(body.categories.map((c) => c.category)).toEqual(['user_preferences', 'repo_conventions'])
  })
})
