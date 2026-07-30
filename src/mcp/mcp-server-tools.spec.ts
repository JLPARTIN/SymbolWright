import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from '../access/access-runtime.js'
import type { RepositoryScope } from '../access/access-types.js'
import { SANDBOX_EGRESS_CAPABILITY } from '../access/sandbox-capabilities.js'
import { MissionService } from '../mission/mission-service.js'
import { DEFAULT_EGRESS_POLICY_LIMITS } from '../sandbox/egress-policy.js'
import {
  SANDBOX_NETWORK_POLICY_FILE_ENV,
  clearApplicationSandboxNetworkRuntimesForTests,
} from '../sandbox/sandbox-network-runtime.js'
import {
  McpAgentTokenAuthenticationError,
  createSymbolWrightMcpToolHandler,
} from './mcp-server-tools.js'

describe('createSymbolWrightMcpToolHandler', () => {
  it('exposes only read-safe tools in READ_ONLY mode', () => {
    const handler = createSymbolWrightMcpToolHandler({ mode: 'READ_ONLY', cwd: process.cwd() })
    const names = handler.list().map((tool) => tool.name)

    expect(names).toContain('read_file')
    expect(names).toContain('list_files')
    expect(names).toContain('search_files')
    expect(names).not.toContain('bash')
    expect(names).not.toContain('local_file_write')
    expect(names).not.toContain('edit_file')
    expect(names).not.toContain('apply_patch')
  })

  it('exposes the full tool set in APPROVED_EXECUTION mode', () => {
    const handler = createSymbolWrightMcpToolHandler({
      mode: 'APPROVED_EXECUTION',
      cwd: process.cwd(),
    })
    const names = handler.list().map((tool) => tool.name)

    expect(names).toContain('bash')
    expect(names).toContain('local_file_write')
    expect(names).toContain('edit_file')
  })

  it('requires explicit repository and branch context before authenticating delegated MCP', () => {
    expect(() =>
      createSymbolWrightMcpToolHandler({
        mode: 'APPROVED_EXECUTION',
        cwd: process.cwd(),
        agentToken: 'sw_agent_untrusted_fixture',
      }),
    ).toThrow(McpAgentTokenAuthenticationError)
    expect(() =>
      createSymbolWrightMcpToolHandler({
        mode: 'APPROVED_EXECUTION',
        cwd: process.cwd(),
        agentToken: 'sw_agent_untrusted_fixture',
      }),
    ).toThrow(/explicit repository and branch context/)
  })

  it('every listed tool has a valid JSON-schema-shaped inputSchema', () => {
    const handler = createSymbolWrightMcpToolHandler({
      mode: 'APPROVED_EXECUTION',
      cwd: process.cwd(),
    })
    for (const tool of handler.list()) {
      expect(tool.inputSchema.type).toBe('object')
      expect(typeof tool.inputSchema.properties).toBe('object')
    }
  })

  it('calls a real read-only tool and returns file contents as text', async () => {
    const handler = createSymbolWrightMcpToolHandler({ mode: 'READ_ONLY', cwd: process.cwd() })
    const result = await handler.call('read_file', { path: 'package.json' })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('"name": "symbolwright"')
  })

  it('refuses to call a tool not exposed by the current mode', async () => {
    const handler = createSymbolWrightMcpToolHandler({ mode: 'READ_ONLY', cwd: process.cwd() })
    const result = await handler.call('bash', { command: 'echo hi' })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('Unknown or unavailable tool')
  })

  it('returns a graceful error instead of throwing when a tool call fails', async () => {
    const handler = createSymbolWrightMcpToolHandler({ mode: 'READ_ONLY', cwd: process.cwd() })
    const result = await handler.call('read_file', { path: 'this-file-does-not-exist.txt' })

    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('failed')
  })

  it('advertises the direct-network research tools to the trusted local operator', () => {
    const handler = createSymbolWrightMcpToolHandler({
      mode: 'APPROVED_EXECUTION',
      cwd: process.cwd(),
    })
    const names = handler.list().map((tool) => tool.name)
    expect(names).toContain('web_fetch')
    expect(names).toContain('web_search')
  })
})

describe('createSymbolWrightMcpToolHandler: governed egress', () => {
  const REPO_SCOPE: RepositoryScope = { mode: 'installation', repositories: [], organizations: [] }
  const originalPolicyFileEnv = process.env[SANDBOX_NETWORK_POLICY_FILE_ENV]
  let root: string

  afterEach(() => {
    clearApplicationSandboxNetworkRuntimesForTests()
    if (root !== undefined) rmSync(root, { recursive: true, force: true })
    if (originalPolicyFileEnv === undefined) {
      delete process.env[SANDBOX_NETWORK_POLICY_FILE_ENV]
    } else {
      process.env[SANDBOX_NETWORK_POLICY_FILE_ENV] = originalPolicyFileEnv
    }
  })

  function writeDocsOnlyEgressPolicy(workspaceRoot: string): void {
    const policyFile = path.join(workspaceRoot, 'sandbox-network-policy.json')
    writeFileSync(
      policyFile,
      JSON.stringify({
        schemaVersion: 1,
        egressProfiles: [
          {
            id: 'docs-only',
            version: 1,
            enabled: true,
            deploymentModes: ['local'],
            callerKinds: ['operator', 'delegated-grant'],
            allowedHosts: ['docs.example.com'],
            allowedMethods: ['GET', 'HEAD'],
            allowedRequestHeaders: ['accept'],
            allowedPorts: [443],
            redirectPolicy: 'same-host',
            credentialPolicy: 'none',
            requireTls: true,
            auditRetentionDays: 30,
            limits: DEFAULT_EGRESS_POLICY_LIMITS,
          },
        ],
        defaultEgressPolicy: { id: 'docs-only', version: 1 },
      }),
      { mode: 0o600 },
    )
    process.env[SANDBOX_NETWORK_POLICY_FILE_ENV] = policyFile
  }

  it('hides sandbox_egress_request from the local operator when no default policy is configured', () => {
    root = mkdtempSync(path.join(tmpdir(), 'symbolwright-mcp-egress-none-'))
    const handler = createSymbolWrightMcpToolHandler({ mode: 'APPROVED_EXECUTION', cwd: root })
    expect(handler.list().map((tool) => tool.name)).not.toContain('sandbox_egress_request')
  })

  it('advertises and executes sandbox_egress_request for the local operator once a default policy is configured', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'symbolwright-mcp-egress-operator-'))
    writeDocsOnlyEgressPolicy(root)
    const handler = createSymbolWrightMcpToolHandler({ mode: 'APPROVED_EXECUTION', cwd: root })
    expect(handler.list().map((tool) => tool.name)).toContain('sandbox_egress_request')

    const result = await handler.call('sandbox_egress_request', {
      url: 'https://blocked.example.com/x',
    })
    // Denied by the docs-only allowlist, but reaches the broker (not an "unavailable tool" refusal).
    expect(result.content[0]?.text).not.toContain('Unknown or unavailable tool')
  })

  it('hides sandbox_egress_request from a delegated grant with no egress policy reference bound', () => {
    root = mkdtempSync(path.join(tmpdir(), 'symbolwright-mcp-egress-delegated-none-'))
    const accessRuntime = new AccessRuntime({ workspaceRoot: root })
    const { plaintextToken } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Delegated agent',
      issuedBy: 'operator-1',
      profileId: 'custom',
      repositoryScope: REPO_SCOPE,
      additionalSymbolWrightCapabilities: [SANDBOX_EGRESS_CAPABILITY],
      explicitHighRiskCapabilities: [SANDBOX_EGRESS_CAPABILITY],
      stepUpConfirmed: true,
      reason: 'test fixture: egress capability without a bound policy reference',
    })
    const handler = createSymbolWrightMcpToolHandler({
      mode: 'APPROVED_EXECUTION',
      cwd: root,
      agentToken: plaintextToken as string,
      repository: 'owner/repo',
      branch: 'agent/topic',
    })
    expect(handler.list().map((tool) => tool.name)).not.toContain('sandbox_egress_request')
  })

  it('advertises and authorizes sandbox_egress_request for a delegated grant with a bound egress policy reference, and records mission evidence', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'symbolwright-mcp-egress-delegated-'))
    const accessRuntime = new AccessRuntime({ workspaceRoot: root })
    const { plaintextToken } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Delegated agent',
      issuedBy: 'operator-1',
      profileId: 'custom',
      repositoryScope: REPO_SCOPE,
      additionalSymbolWrightCapabilities: [SANDBOX_EGRESS_CAPABILITY],
      explicitHighRiskCapabilities: [SANDBOX_EGRESS_CAPABILITY],
      stepUpConfirmed: true,
      reason: 'test fixture: egress capability with a bound policy reference',
      sandboxPolicyReferences: { egress: { id: 'docs-only', version: 1 } },
      approvalPolicy: { rules: [{ match: '*', requirement: 'none' }] },
    })
    const missionService = new MissionService({ workspaceRoot: root })
    const mission = await missionService.create({
      name: 'Egress MCP mission',
      objective: 'Prove delegated MCP egress records mission evidence',
      workspaceKind: 'repository',
      repositoryPath: '.',
      runtimeMode: 'APPROVED_EXECUTION',
      labels: [],
    })
    const handler = createSymbolWrightMcpToolHandler({
      mode: 'APPROVED_EXECUTION',
      cwd: root,
      agentToken: plaintextToken as string,
      repository: 'owner/repo',
      branch: 'agent/topic',
      missionId: mission.id,
    })
    expect(handler.list().map((tool) => tool.name)).toContain('sandbox_egress_request')

    await handler.call('sandbox_egress_request', { url: 'https://blocked.example.com/x' })

    const events = missionService.readEvents(mission.id).map((event) => event.type)
    expect(events).toContain('sandbox.egress.blocked')
  })

  it('never advertises the direct-network research tools to a delegated caller, even with egress granted', () => {
    root = mkdtempSync(path.join(tmpdir(), 'symbolwright-mcp-egress-research-tools-'))
    const accessRuntime = new AccessRuntime({ workspaceRoot: root })
    const { plaintextToken } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Delegated agent',
      issuedBy: 'operator-1',
      profileId: 'custom',
      repositoryScope: REPO_SCOPE,
      additionalSymbolWrightCapabilities: [SANDBOX_EGRESS_CAPABILITY],
      explicitHighRiskCapabilities: [SANDBOX_EGRESS_CAPABILITY],
      stepUpConfirmed: true,
      reason: 'test fixture: egress granted but research tools must stay hidden',
      sandboxPolicyReferences: { egress: { id: 'docs-only', version: 1 } },
    })
    const handler = createSymbolWrightMcpToolHandler({
      mode: 'APPROVED_EXECUTION',
      cwd: root,
      agentToken: plaintextToken as string,
      repository: 'owner/repo',
      branch: 'agent/topic',
    })
    const names = handler.list().map((tool) => tool.name)
    expect(names).not.toContain('web_fetch')
    expect(names).not.toContain('web_search')
  })
})
