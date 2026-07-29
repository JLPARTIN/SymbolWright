import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { clearApplicationSandboxNetworkRuntimesForTests } from '../sandbox/sandbox-network-runtime.js'
import { MetricsRegistry } from './metrics-registry.js'
import { prepareOperationalServerOptions } from './operational-bootstrap.js'
import { ReadinessRegistry } from './readiness-registry.js'

const roots: string[] = []

afterEach(() => {
  clearApplicationSandboxNetworkRuntimesForTests()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('sandbox network operational composition', () => {
  it('registers offline-only readiness and metrics during server preparation', async () => {
    const cwd = createWorkspace()
    const readinessRegistry = new ReadinessRegistry()
    const metricsRegistry = new MetricsRegistry()

    const prepared = await prepareOperationalServerOptions({
      apiKey: 'test-key',
      host: '127.0.0.1',
      port: 8787,
      cwd,
      env: {},
      readinessRegistry,
      metricsRegistry,
    })

    expect(prepared.options.readinessRegistry).toBe(readinessRegistry)
    expect(prepared.options.metricsRegistry).toBe(metricsRegistry)
    expect(readinessRegistry.detailedSnapshot().checks['sandbox_network_gateway']).toEqual({
      ready: true,
      detail: 'offline-only; no sandbox network policy file is configured',
    })
    expect(metricsRegistry.snapshot().gauges).toMatchObject({
      sandbox_network_configured: 0,
      sandbox_dependency_policy_profiles: 0,
      sandbox_egress_policy_profiles: 0,
    })
  })
})

function createWorkspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'symbolwright-network-server-'))
  roots.push(root)
  return root
}
