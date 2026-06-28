import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createFixtureContext } from '../registry/fixture-registry-factory.js'

import { executeLiveReadPolicyTool, liveReadPolicyHandshakeTool } from './live-read-policy-tool.js'

function writePolicyFixture(data: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-policy-'))
  const filePath = path.join(dir, 'policy-fixture.json')
  fs.writeFileSync(filePath, JSON.stringify(data))
  return filePath
}

describe('executeLiveReadPolicyTool', () => {
  it('allows valid dry-run request', async () => {
    const fixturePath = writePolicyFixture({
      provider: 'github',
      purpose: 'review PR evidence',
      scopes: ['pr:read', 'checks:read'],
      dryRun: true,
    })

    const output = await executeLiveReadPolicyTool({ path: fixturePath }, createFixtureContext())

    expect(output).toContain('CodeMind live read policy handshake')
    expect(output).toContain('Decision: ALLOW')
    expect(output).toContain('Provider: github')
    expect(output).toContain('Dry run: yes')
  })

  it('blocks non-dry-run request', async () => {
    const fixturePath = writePolicyFixture({
      provider: 'github',
      purpose: 'fetch data',
      scopes: ['pr:read'],
      dryRun: false,
    })

    const output = await executeLiveReadPolicyTool({ path: fixturePath }, createFixtureContext())

    expect(output).toContain('Decision: BLOCK')
    expect(output).toContain('dryRun=true')
  })

  it('blocks unsupported provider', async () => {
    const fixturePath = writePolicyFixture({
      provider: 'gitlab',
      purpose: 'read MRs',
      scopes: ['pr:read'],
      dryRun: true,
    })

    const output = await executeLiveReadPolicyTool({ path: fixturePath }, createFixtureContext())

    expect(output).toContain('Decision: BLOCK')
    expect(output).toContain('unsupported provider')
  })

  it('blocks disallowed scopes', async () => {
    const fixturePath = writePolicyFixture({
      provider: 'github',
      purpose: 'write comments',
      scopes: ['pr:read', 'issues:write'],
      dryRun: true,
    })

    const output = await executeLiveReadPolicyTool({ path: fixturePath }, createFixtureContext())

    expect(output).toContain('Decision: BLOCK')
    expect(output).toContain('disallowed scopes')
  })

  it('includes boundary markers', async () => {
    const fixturePath = writePolicyFixture({
      provider: 'github',
      purpose: 'check CI',
      scopes: ['checks:read'],
      dryRun: true,
    })

    const output = await executeLiveReadPolicyTool({ path: fixturePath }, createFixtureContext())

    expect(output).toContain('Boundary:')
    expect(output).toContain('read-only adapter handshake only')
    expect(output).toContain('no service call is performed')
  })

  it('includes requested scopes in output', async () => {
    const fixturePath = writePolicyFixture({
      provider: 'github',
      purpose: 'review',
      scopes: ['pr:read', 'contents:read'],
      dryRun: true,
    })

    const output = await executeLiveReadPolicyTool({ path: fixturePath }, createFixtureContext())

    expect(output).toContain('pr:read')
    expect(output).toContain('contents:read')
  })
})

describe('liveReadPolicyHandshakeTool', () => {
  it('has correct tool metadata', () => {
    expect(liveReadPolicyHandshakeTool.name).toBe('live_read_policy_handshake')
    expect(liveReadPolicyHandshakeTool.capability).toBe('POLICY_CHECK')
  })

  it('throws on missing path input', async () => {
    await expect(liveReadPolicyHandshakeTool.execute({}, createFixtureContext())).rejects.toThrow(
      'Missing JSON fixture path',
    )
  })

  it('throws on empty path input', async () => {
    await expect(
      liveReadPolicyHandshakeTool.execute({ path: '  ' }, createFixtureContext()),
    ).rejects.toThrow('Missing JSON fixture path')
  })

  it('throws on nonexistent fixture file', async () => {
    await expect(
      liveReadPolicyHandshakeTool.execute(
        { path: '/nonexistent/fixture.json' },
        createFixtureContext(),
      ),
    ).rejects.toThrow('Fixture file not found')
  })
})
