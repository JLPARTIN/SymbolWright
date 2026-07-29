import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
  SANDBOX_EGRESS_CAPABILITY,
} from '../access/sandbox-capabilities.js'
import type { DependencyPolicyProfile } from './dependency-policy.js'
import type { EgressPolicyProfile } from './egress-policy.js'
import { SandboxNetworkGateway } from './sandbox-network-gateway.js'
import type { SandboxAuthorizationContext } from './sandbox-policy-model.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

function root(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-network-gateway-')).then((value) => {
    roots.push(value)
    return value
  })
}

function authorization(
  capability: string,
  reference: { readonly id: string; readonly version: number },
  policyVersions: Readonly<Record<string, number>>,
): SandboxAuthorizationContext {
  return {
    deploymentMode: 'hosted',
    callerKind: 'delegated-grant',
    runtimeMode: 'APPROVED_EXECUTION',
    approvedCapabilityIds: [capability],
    repositoryId: 'repository-1',
    workspaceId: 'workspace-1',
    missionId: 'mission-1',
    grantId: 'grant-1',
    grantVersion: 7,
    policyReference: reference,
    approval: {
      id: 'approval-1',
      capabilityId: capability,
      grantVersion: 7,
      policyVersions,
    },
  }
}

const DEPENDENCY_PROFILE: DependencyPolicyProfile = {
  id: 'npm-public',
  version: 2,
  enabled: true,
  ecosystems: ['npm'],
  deploymentModes: ['hosted'],
  callerKinds: ['delegated-grant'],
  allowedRegistries: ['https://registry.npmjs.org/'],
  requireLockfile: true,
  allowLockfileMutation: false,
  suppressLifecycleScripts: true,
  directIpDestinations: 'denied',
  cacheNamespace: 'npm-public-v2',
  limits: {
    maxPackages: 10,
    maxRequests: 20,
    maxArchiveBytes: 1_000_000,
    maxExpandedBytes: 2_000_000,
    maxFiles: 100,
    maxFileBytes: 200_000,
    maxTotalBytes: 4_000_000,
    timeoutMs: 30_000,
    maxConcurrency: 1,
  },
}

const EGRESS_PROFILE: EgressPolicyProfile = {
  id: 'runtime-api',
  version: 3,
  enabled: true,
  deploymentModes: ['hosted'],
  callerKinds: ['delegated-grant'],
  allowedHosts: ['api.example.com'],
  allowedMethods: ['GET'],
  allowedRequestHeaders: ['accept'],
  allowedPorts: [443],
  redirectPolicy: 'denied',
  credentialPolicy: 'none',
  requireTls: true,
  auditRetentionDays: 30,
  limits: {
    maxRequests: 2,
    maxRequestBytes: 1_000,
    maxResponseBytes: 2_000,
    maxTotalSentBytes: 2_000,
    maxTotalReceivedBytes: 4_000,
    timeoutMs: 30_000,
    maxConcurrency: 1,
    maxRedirects: 1,
  },
}

describe('SandboxNetworkGateway', () => {
  it('fails closed without an explicitly installed dependency profile and persists the denial', async () => {
    const stateRoot = await root()
    const gateway = new SandboxNetworkGateway({ stateRoot })
    const result = await gateway.acquireNpm({
      packageJsonText: '{"name":"fixture","version":"1.0.0"}',
      packageLockText: '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}',
      authorization: authorization(
        SANDBOX_DEPENDENCY_ACQUIRE_CAPABILITY,
        { id: 'missing', version: 1 },
        {},
      ),
    })

    expect(result.report).toMatchObject({
      status: 'blocked',
      decisionCode: 'DEPENDENCY_POLICY_NOT_FOUND',
    })
    expect(result.evidencePath).toBeDefined()
    expect(await fs.readFile(result.evidencePath!, 'utf8')).toContain(
      'DEPENDENCY_POLICY_NOT_FOUND',
    )
  })

  it('keeps egress broker-only, closes the session, and writes durable redacted evidence', async () => {
    const stateRoot = await root()
    const requester = {
      request: vi.fn(async () => ({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"ok":true}'),
      })),
    }
    const gateway = new SandboxNetworkGateway({
      stateRoot,
      dependencyProfiles: [DEPENDENCY_PROFILE],
      egressProfiles: [EGRESS_PROFILE],
      egressResolver: {
        resolve: async () => ({
          addresses: [{ address: '93.184.216.34', family: 4 as const }],
          cnameChain: [],
        }),
      },
      egressRequester: requester,
    })
    const result = await gateway.requestEgress({
      sessionId: 'raw-session-secret',
      authorization: authorization(
        SANDBOX_EGRESS_CAPABILITY,
        { id: EGRESS_PROFILE.id, version: EGRESS_PROFILE.version },
        {
          'egress-global': 1,
          [EGRESS_PROFILE.id]: EGRESS_PROFILE.version,
          'grant:grant-1': 7,
          'mission:mission-1': 1,
          'egress-request-tightening': 1,
        },
      ),
      request: { url: 'https://api.example.com/v1/items?token=secret' },
    })

    expect(result.statusCode).toBe(200)
    expect(requester.request).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedAddress: { address: '93.184.216.34', family: 4 },
      }),
    )
    expect(gateway.egressMetricsSnapshot()).toMatchObject({
      activeSessions: 0,
      activeRequests: 0,
      allowedRequests: 1,
    })
    const audit = await fs.readFile(
      path.join(stateRoot, 'egress', 'sandbox-egress-audit.jsonl'),
      'utf8',
    )
    expect(audit).not.toContain('raw-session-secret')
    expect(audit).not.toContain('token=secret')
    expect(audit).not.toContain('93.184.216.34')
  })
})
