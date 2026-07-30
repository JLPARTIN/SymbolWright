import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GovernedDependencyAcquisitionResult } from '../../sandbox/governed-dependency-acquisition.js'
import type { SandboxAuthorizationContext } from '../../sandbox/sandbox-policy-model.js'
import type { ApplicationSandboxNetworkRuntime } from '../../sandbox/sandbox-network-runtime.js'
import { dependencyAcquireTool } from './dependency-acquire-tool.js'
import type { RuntimeToolContext, SymbolWrightRuntimeMode } from '../types.js'

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  acquire: vi.fn(),
  render: vi.fn(),
}))

vi.mock('../../sandbox/governed-dependency-acquisition.js', () => ({
  parseGovernedDependencyAcquisitionRequest: mocks.parse,
  acquireGovernedNpmDependencies: mocks.acquire,
  renderGovernedDependencyAcquisitionResult: mocks.render,
}))

const runtime = {} as ApplicationSandboxNetworkRuntime
const authorization = {} as SandboxAuthorizationContext
const acquisitionResult = {
  session: {
    report: { status: 'completed' },
  },
} as unknown as GovernedDependencyAcquisitionResult

describe('dependencyAcquireTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.parse.mockReturnValue({ registryUrls: ['https://registry.npmjs.org/'] })
    mocks.acquire.mockResolvedValue(acquisitionResult)
    mocks.render.mockReturnValue('{"status":"completed"}')
  })

  it('rejects execution outside APPROVED_EXECUTION mode', async () => {
    await expect(dependencyAcquireTool.execute({}, context({ mode: 'READ_ONLY' }))).rejects.toThrow(
      'dependency_acquire requires APPROVED_EXECUTION mode.',
    )
  })

  it('fails closed when the application-owned network runtime is unavailable', async () => {
    await expect(
      dependencyAcquireTool.execute({}, context({ includeRuntime: false })),
    ).rejects.toThrow('The application-owned sandbox network runtime is unavailable.')
  })

  it('fails closed when no server-derived dependency authority is present', async () => {
    await expect(
      dependencyAcquireTool.execute({}, context({ includeAuthorization: false })),
    ).rejects.toThrow(
      'No server-derived dependency policy reference is authorized for this workspace.',
    )
  })

  it('parses, acquires, records, and renders through the authorized runtime', async () => {
    const recordDependencyAcquisition = vi.fn()
    const input = { registryUrls: ['https://registry.npmjs.org/'] }

    await expect(
      dependencyAcquireTool.execute(input, context({ recordDependencyAcquisition })),
    ).resolves.toBe('{"status":"completed"}')

    expect(mocks.parse).toHaveBeenCalledWith(input)
    expect(mocks.acquire).toHaveBeenCalledWith({
      workspaceRoot: '/workspace',
      runtime,
      authorization,
      request: { registryUrls: ['https://registry.npmjs.org/'] },
    })
    expect(recordDependencyAcquisition).toHaveBeenCalledWith(acquisitionResult)
    expect(mocks.render).toHaveBeenCalledWith(acquisitionResult)
  })

  it('allows an authorized caller when no optional evidence recorder is configured', async () => {
    await expect(dependencyAcquireTool.execute({}, context())).resolves.toBe(
      '{"status":"completed"}',
    )
  })
})

function context(
  options: {
    readonly mode?: SymbolWrightRuntimeMode
    readonly includeRuntime?: boolean
    readonly includeAuthorization?: boolean
    readonly recordDependencyAcquisition?: (
      result: GovernedDependencyAcquisitionResult,
    ) => Promise<void>
  } = {},
): RuntimeToolContext {
  const value: Record<string, unknown> = {
    cwd: '/workspace',
    policy: { mode: options.mode ?? 'APPROVED_EXECUTION' },
  }
  if (options.includeRuntime !== false) value['sandboxNetworkRuntime'] = runtime
  if (options.includeAuthorization !== false) {
    value['sandboxDependencyAuthorization'] = authorization
  }
  if (options.recordDependencyAcquisition !== undefined) {
    value['recordDependencyAcquisition'] = options.recordDependencyAcquisition
  }
  return value as unknown as RuntimeToolContext
}
