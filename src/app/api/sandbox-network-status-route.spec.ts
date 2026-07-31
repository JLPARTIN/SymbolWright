import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { AccessRuntime } from '../../access/access-runtime.js'
import { UnlimitedRateLimiter } from '../../server/rate-limiter.js'
import { startChatServer, type StartedChatServer } from '../../server/symbolwright-chat-server.js'

const API_KEY = 'sandbox-network-status-test-key'
let root: string
let started: StartedChatServer | undefined

function operatorAuth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}` }
}

async function launch(): Promise<StartedChatServer> {
  root = mkdtempSync(join(tmpdir(), 'symbolwright-sandbox-network-status-'))
  started = await startChatServer({
    apiKey: API_KEY,
    host: '127.0.0.1',
    port: 0,
    cwd: root,
    env: {},
    rateLimiter: new UnlimitedRateLimiter(),
  })
  return started
}

afterEach(async () => {
  if (started !== undefined) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()))
    started = undefined
  }
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
})

describe('GET /api/sandbox/network-status', () => {
  it('reports offline-only mode with empty profile inventory by default', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/sandbox/network-status`, {
      headers: operatorAuth(),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      mode: string
      dependency: { profileCount: number; profiles: unknown[] }
      egress: { profileCount: number; profiles: unknown[]; metrics: { activeSessions: number } }
    }
    expect(body.mode).toBe('offline-only')
    expect(body.dependency).toMatchObject({ profileCount: 0, profiles: [] })
    expect(body.egress).toMatchObject({ profileCount: 0, profiles: [] })
    expect(body.egress.metrics).toMatchObject({ activeSessions: 0 })
  })

  it('reports empty dependency-layer-binding health, a non-existent audit log, and aggregate concurrency limits by default', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/sandbox/network-status`, {
      headers: operatorAuth(),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      dependencyLayerBindings: { total: number; valid: number; missing: number; invalid: number }
      egressAuditLog: { exists: boolean; sizeBytes: number; lastModifiedAt: string | undefined }
      aggregateConcurrency: {
        egress: { active: number; limit: number }
        dependency: { active: number; limit: number }
      }
    }
    expect(body.dependencyLayerBindings).toEqual({ total: 0, valid: 0, missing: 0, invalid: 0 })
    expect(body.egressAuditLog).toEqual({ exists: false, sizeBytes: 0, lastModifiedAt: undefined })
    expect(body.aggregateConcurrency.egress).toMatchObject({ active: 0 })
    expect(body.aggregateConcurrency.egress.limit).toBeGreaterThan(0)
    expect(body.aggregateConcurrency.dependency).toMatchObject({ active: 0 })
    expect(body.aggregateConcurrency.dependency.limit).toBeGreaterThan(0)
  })

  it('never exposes a state-root or policy-file filesystem path', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/sandbox/network-status`, {
      headers: operatorAuth(),
    })
    const text = await response.text()
    expect(text).not.toContain(root)
    expect(text).not.toContain('stateRoot')
    expect(text).not.toContain('policyFile')
  })

  it('lists configured dependency and egress profiles with redacted, non-secret fields', async () => {
    root = mkdtempSync(join(tmpdir(), 'symbolwright-sandbox-network-status-'))
    const policyFile = join(root, 'sandbox-network-policy.json')
    writeFileSync(
      policyFile,
      JSON.stringify({
        schemaVersion: 1,
        dependencyProfiles: [
          {
            id: 'npm-public',
            version: 1,
            enabled: true,
            ecosystems: ['npm'],
            deploymentModes: ['local'],
            callerKinds: ['operator'],
            allowedRegistries: ['https://registry.npmjs.org/'],
            requireLockfile: true,
            allowLockfileMutation: false,
            suppressLifecycleScripts: true,
            directIpDestinations: 'denied',
            cacheNamespace: 'npm-public',
            limits: {
              maxPackages: 100,
              maxRequests: 200,
              maxArchiveBytes: 67108864,
              maxExpandedBytes: 536870912,
              maxFiles: 100000,
              maxFileBytes: 33554432,
              maxTotalBytes: 1073741824,
              timeoutMs: 300000,
              maxConcurrency: 4,
            },
          },
        ],
        defaultDependencyPolicy: { id: 'npm-public', version: 1 },
        egressProfiles: [
          {
            id: 'docs-only',
            version: 1,
            enabled: true,
            deploymentModes: ['local'],
            callerKinds: ['operator'],
            allowedHosts: ['docs.example.com'],
            allowedMethods: ['GET', 'HEAD'],
            allowedRequestHeaders: ['accept'],
            allowedPorts: [443],
            redirectPolicy: 'same-host',
            credentialPolicy: 'none',
            requireTls: true,
            auditRetentionDays: 30,
            limits: {
              maxRequests: 20,
              maxRequestBytes: 1048576,
              maxResponseBytes: 8388608,
              maxTotalSentBytes: 8388608,
              maxTotalReceivedBytes: 33554432,
              timeoutMs: 30000,
              maxConcurrency: 2,
              maxRedirects: 3,
            },
          },
        ],
        defaultEgressPolicy: { id: 'docs-only', version: 1 },
      }),
      { mode: 0o600 },
    )
    started = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      cwd: root,
      env: { SYMBOLWRIGHT_SANDBOX_NETWORK_POLICY_FILE: policyFile },
      rateLimiter: new UnlimitedRateLimiter(),
    })

    const response = await fetch(`${started.url}/api/sandbox/network-status`, {
      headers: operatorAuth(),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      mode: string
      dependency: { profileCount: number; defaultPolicy: unknown; profiles: unknown[] }
      egress: { profileCount: number; defaultPolicy: unknown; profiles: unknown[] }
    }
    expect(body.mode).toBe('configured')
    expect(body.dependency.defaultPolicy).toEqual({ id: 'npm-public', version: 1 })
    expect(body.dependency.profiles).toEqual([
      {
        id: 'npm-public',
        version: 1,
        enabled: true,
        ecosystems: ['npm'],
        deploymentModes: ['local'],
        callerKinds: ['operator'],
        allowedRegistries: ['https://registry.npmjs.org/'],
      },
    ])
    expect(body.egress.defaultPolicy).toEqual({ id: 'docs-only', version: 1 })
    expect(body.egress.profiles).toEqual([
      {
        id: 'docs-only',
        version: 1,
        enabled: true,
        deploymentModes: ['local'],
        callerKinds: ['operator'],
        allowedHosts: ['docs.example.com'],
        allowedMethods: ['GET', 'HEAD'],
        redirectPolicy: 'same-host',
        credentialPolicy: 'none',
        requireTls: true,
      },
    ])
  })

  it('404s (not 403) for a non-operator (delegated grant) caller, without revealing the route exists', async () => {
    const server = await launch()
    const accessRuntime = new AccessRuntime({ workspaceRoot: root })
    const { plaintextToken } = accessRuntime.grantService.createGrant({
      principalType: 'coding-agent',
      displayName: 'Delegated agent',
      issuedBy: 'operator-1',
      profileId: 'coding-agent',
      repositoryScope: { mode: 'installation', repositories: [], organizations: [] },
    })
    const response = await fetch(`${server.url}/api/sandbox/network-status`, {
      headers: { authorization: `Bearer ${plaintextToken}` },
    })
    expect(response.status).toBe(404)
    expect((await response.json()) as { error: string }).toEqual({ error: 'not_found' })
  })

  it('requires authentication', async () => {
    const server = await launch()
    const response = await fetch(`${server.url}/api/sandbox/network-status`)
    expect(response.status).toBe(401)
  })
})
