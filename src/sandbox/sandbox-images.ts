import type { SandboxImageDefinition, SandboxRunnerAvailability } from './sandbox-types.js'

export interface SandboxContainerEngineStatus {
  readonly engine: 'docker' | 'podman' | 'none'
  readonly status: 'available' | 'unavailable' | 'misconfigured'
  readonly version?: string
  readonly reason: string
}

export interface SandboxImagePolicySummary {
  readonly engine: SandboxContainerEngineStatus
  readonly images: readonly SandboxImageDefinition[]
  readonly warnings: readonly string[]
}

export const STRONG_SANDBOX_NODE_IMAGE_ID = 'node-26-alpine-pinned'
export const STRONG_SANDBOX_NODE_IMAGE_DIGEST =
  'sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66'
export const STRONG_SANDBOX_NODE_IMAGE =
  `node:26-alpine@${STRONG_SANDBOX_NODE_IMAGE_DIGEST}` as const

const IMAGE_POLICY_SOURCE =
  'SymbolWright built-in strong-sandbox allowlist; operator preparation and local image verification required.'

export const DEFAULT_SANDBOX_IMAGE_ALLOWLIST: readonly SandboxImageDefinition[] = [
  {
    id: STRONG_SANDBOX_NODE_IMAGE_ID,
    image: STRONG_SANDBOX_NODE_IMAGE,
    digest: STRONG_SANDBOX_NODE_IMAGE_DIGEST,
    languages: ['javascript'],
    source: IMAGE_POLICY_SOURCE,
    enabled: false,
    installed: false,
  },
]

export function selectContainerEngine(
  commandAvailability: ReadonlyMap<string, SandboxRunnerAvailability>,
): SandboxContainerEngineStatus {
  const docker = availabilitySummary('docker', commandAvailability.get('docker'))
  if (docker.status === 'available') return docker
  const podman = availabilitySummary('podman', commandAvailability.get('podman'))
  if (podman.status === 'available') return podman
  return {
    engine: 'none',
    status:
      docker.status === 'misconfigured' || podman.status === 'misconfigured'
        ? 'misconfigured'
        : 'unavailable',
    reason: [
      'No usable container engine is available for strong sandbox execution.',
      `Docker: ${docker.reason}`,
      `Podman: ${podman.reason}`,
    ].join(' '),
  }
}

export function buildSandboxImagePolicy(
  commandAvailability: ReadonlyMap<string, SandboxRunnerAvailability> = new Map(),
  env: NodeJS.ProcessEnv = process.env,
): SandboxImagePolicySummary {
  const engine = selectContainerEngine(commandAvailability)
  const enabled = env['SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION'] === 'true'
  const images = DEFAULT_SANDBOX_IMAGE_ALLOWLIST.map((image) => ({
    ...image,
    enabled,
  }))
  return {
    engine,
    images,
    warnings: [
      'Strong sandbox images are selected only from a digest-pinned built-in allowlist.',
      'Normal sandbox execution uses --pull=never and never downloads an image.',
      'Operators must preinstall the exact digest before enabling strong container execution.',
      'The first executable strong-container slice supports JavaScript only; other ecosystems fail closed.',
      enabled
        ? engine.status === 'available'
          ? `${engine.engine} is available; the exact image digest is verified again before every execution.`
          : engine.reason
        : 'Strong container execution is disabled until SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION=true.',
    ],
  }
}

export function findSandboxImage(
  images: readonly SandboxImageDefinition[],
  imageId: string,
): SandboxImageDefinition | undefined {
  return images.find((image) => image.id === imageId)
}

export function isAllowedSandboxImageId(
  images: readonly SandboxImageDefinition[],
  imageId: string,
): boolean {
  return findSandboxImage(images, imageId) !== undefined
}

function availabilitySummary(
  engine: 'docker' | 'podman',
  availability: SandboxRunnerAvailability | undefined,
): SandboxContainerEngineStatus {
  if (availability === undefined) {
    return {
      engine,
      status: 'unavailable',
      reason: `${engine} was not probed yet. Refresh runtime inventory to check container support.`,
    }
  }
  if (availability.status === 'available') {
    return {
      engine,
      status: 'available',
      ...(availability.version === undefined ? {} : { version: availability.version }),
      reason: `${engine} is available for digest-verified, pull-never strong sandbox execution.`,
    }
  }
  return {
    engine,
    status: availability.status,
    ...(availability.version === undefined ? {} : { version: availability.version }),
    reason: availability.reason ?? `${engine} is not available for sandbox container execution.`,
  }
}
