import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_DEPENDENCY_ACQUISITION_LIMITS } from './dependency-policy.js'
import { DEFAULT_EGRESS_POLICY_LIMITS } from './egress-policy.js'
import {
  SANDBOX_NETWORK_POLICY_FILE_ENV,
  clearApplicationSandboxNetworkRuntimesForTests,
  getOrCreateApplicationSandboxNetworkRuntime,
  sandboxNetworkReadinessDetail,
} from './sandbox-network-runtime.js'

const roots: string[] = []

afterEach(() => {
  clearApplicationSandboxNetworkRuntimesForTests()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('application sandbox network runtime', () => {
  it('creates one offline-only runtime per resolved workspace by default', () => {
    const workspaceRoot = createWorkspace()
    const first = getOrCreateApplicationSandboxNetworkRuntime({ workspaceRoot, env: {} })
    const second = getOrCreateApplicationSandboxNetworkRuntime({
      workspaceRoot: path.join(workspaceRoot, '.'),
      env: { [SANDBOX_NETWORK_POLICY_FILE_ENV]: 'ignored-after-first-creation.json' },
    })

    expect(second).toBe(first)
    expect(first.status).toEqual({
      mode: 'offline-only',
      stateRoot: path.join(workspaceRoot, '.symbolwright', 'sandbox-network'),
      dependencyProfileCount: 0,
      egressProfileCount: 0,
    })
    expect(sandboxNetworkReadinessDetail(first.status)).toContain('offline-only')
    expect(first.gateway.egressMetricsSnapshot()).toEqual({
      activeSessions: 0,
      activeRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      quotaExhaustions: 0,
      cancellations: 0,
      policyRevocations: 0,
      bytesSent: 0,
      bytesReceived: 0,
    })
  })

  it('loads and validates operator-owned dependency and egress profiles once', () => {
    const workspaceRoot = createWorkspace()
    const policyFile = path.join(workspaceRoot, 'sandbox-network-policy.json')
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
            deploymentModes: ['local', 'hosted'],
            callerKinds: ['operator', 'delegated-grant'],
            allowedRegistries: ['https://registry.npmjs.org/'],
            requireLockfile: true,
            allowLockfileMutation: false,
            suppressLifecycleScripts: true,
            directIpDestinations: 'denied',
            cacheNamespace: 'npm-public',
            limits: DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
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
            limits: DEFAULT_EGRESS_POLICY_LIMITS,
          },
        ],
      }),
      { mode: 0o600 },
    )

    const runtime = getOrCreateApplicationSandboxNetworkRuntime({
      workspaceRoot,
      env: { [SANDBOX_NETWORK_POLICY_FILE_ENV]: policyFile },
    })

    expect(runtime.defaultDependencyPolicyReference).toEqual({ id: 'npm-public', version: 1 })
    expect(runtime.status).toEqual({
      mode: 'configured',
      stateRoot: path.join(workspaceRoot, '.symbolwright', 'sandbox-network'),
      policyFile,
      dependencyProfileCount: 1,
      defaultDependencyPolicy: 'npm-public@1',
      egressProfileCount: 1,
    })
    expect(sandboxNetworkReadinessDetail(runtime.status)).toBe(
      'configured; dependencyProfiles=1; defaultDependencyPolicy=npm-public@1; egressProfiles=1',
    )
  })

  it('fails closed when the operator policy file is malformed', () => {
    const workspaceRoot = createWorkspace()
    const policyFile = path.join(workspaceRoot, 'sandbox-network-policy.json')
    writeFileSync(policyFile, '{not-json', { mode: 0o600 })

    expect(() =>
      getOrCreateApplicationSandboxNetworkRuntime({
        workspaceRoot,
        env: { [SANDBOX_NETWORK_POLICY_FILE_ENV]: policyFile },
      }),
    ).toThrow(`Unable to parse ${SANDBOX_NETWORK_POLICY_FILE_ENV}`)
  })

  it('fails closed when a profile violates the authoritative policy schema', () => {
    const workspaceRoot = createWorkspace()
    const policyFile = path.join(workspaceRoot, 'sandbox-network-policy.json')
    writeFileSync(
      policyFile,
      JSON.stringify({
        schemaVersion: 1,
        dependencyProfiles: [
          {
            id: 'invalid',
            version: 0,
            enabled: true,
            ecosystems: ['npm'],
            deploymentModes: ['local'],
            callerKinds: ['operator'],
            allowedRegistries: ['https://registry.npmjs.org/'],
            requireLockfile: true,
            allowLockfileMutation: false,
            suppressLifecycleScripts: true,
            directIpDestinations: 'denied',
            cacheNamespace: 'invalid',
            limits: DEFAULT_DEPENDENCY_ACQUISITION_LIMITS,
          },
        ],
      }),
      { mode: 0o600 },
    )

    expect(() =>
      getOrCreateApplicationSandboxNetworkRuntime({
        workspaceRoot,
        env: { [SANDBOX_NETWORK_POLICY_FILE_ENV]: policyFile },
      }),
    ).toThrow()
  })
})

function createWorkspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'symbolwright-network-runtime-'))
  roots.push(root)
  return root
}
