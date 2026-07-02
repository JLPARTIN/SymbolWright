import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { renderMcpCommand } from '../../cli-mcp.js'
import { createRuntimePolicyForMode } from '../policy/runtime-policy.js'
import { renderMcpToolExecution } from './mcp-runtime.js'

const fixturePath = fileURLToPath(new URL('../../../fixtures/mcp/stdio-fixture-server.mjs', import.meta.url))
const secret = 'sk-test-secret-123456'

function createWorkspace(allowedTools: readonly string[] = ['echo', 'add', 'reveal_secret']): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-mcp-runtime-'))
  fs.mkdirSync(path.join(root, '.codemind'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.codemind', 'mcp.json'),
    JSON.stringify(
      {
        servers: {
          fixture: {
            transport: 'stdio',
            command: process.execPath,
            args: [fixturePath],
            env: { MCP_FIXTURE_SECRET: secret },
            timeoutMs: 3000,
            allowedTools,
          },
        },
      },
      null,
      2,
    ),
  )
  return root
}

describe('MCP runtime execution', () => {
  it('discovers and calls an allowed MCP stdio tool through the CLI command surface', async () => {
    const root = createWorkspace()

    try {
      await expect(renderMcpCommand(['tools', 'fixture'], root)).resolves.toContain('Allowed tools:')
      const output = await renderMcpCommand(['call', 'fixture', 'echo', '{"message":"hello"}'], root)
      expect(output).toContain('Outcome: EXECUTED')
      expect(output).toContain('echo:hello')
      expect(output).toContain('Runtime audit log')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('redacts configured MCP env secrets from tool output evidence', async () => {
    const root = createWorkspace()

    try {
      const output = await renderMcpToolExecution({
        cwd: root,
        policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
        request: { server: 'fixture', tool: 'reveal_secret', arguments: {} },
      })

      expect(output).toContain('<redacted>')
      expect(output).not.toContain(secret)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('blocks tool calls denied by MCP config policy before server execution', async () => {
    const root = createWorkspace(['echo'])

    try {
      const output = await renderMcpToolExecution({
        cwd: root,
        policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
        request: { server: 'fixture', tool: 'add', arguments: { a: 1, b: 2 } },
      })

      expect(output).toContain('Outcome: BLOCKED')
      expect(output).toContain('not in allowedTools')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('blocks execution when CodeMind runtime policy disables shell access', async () => {
    const root = createWorkspace()

    try {
      const output = await renderMcpToolExecution({
        cwd: root,
        policy: createRuntimePolicyForMode('READ_ONLY'),
        request: { server: 'fixture', tool: 'echo', arguments: { message: 'blocked' } },
      })

      expect(output).toContain('Outcome: BLOCKED')
      expect(output).toContain('Shell execution is disabled by runtime policy')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
