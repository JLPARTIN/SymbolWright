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

const IMAGE_POLICY_SOURCE =
  'SymbolWright built-in sandbox image allowlist; operator preparation required.'

export const DEFAULT_SANDBOX_IMAGE_ALLOWLIST: readonly SandboxImageDefinition[] = [
  {
    id: 'node-22-bookworm-slim',
    image: 'node:22-bookworm-slim',
    languages: ['javascript', 'typescript'],
    source: IMAGE_POLICY_SOURCE,
    enabled: false,
  },
  {
    id: 'python-3-12-slim',
    image: 'python:3.12-slim',
    languages: ['python'],
    source: IMAGE_POLICY_SOURCE,
    enabled: false,
  },
  {
    id: 'golang-1-23-bookworm',
    image: 'golang:1.23-bookworm',
    languages: ['go'],
    source: IMAGE_POLICY_SOURCE,
    enabled: false,
  },
  {
    id: 'rust-1-bookworm',
    image: 'rust:1-bookworm',
    languages: ['rust'],
    source: IMAGE_POLICY_SOURCE,
    enabled: false,
  },
  {
    id: 'eclipse-temurin-21-jdk',
    image: 'eclipse-temurin:21-jdk',
    languages: ['java'],
    source: IMAGE_POLICY_SOURCE,
    enabled: false,
  },
]

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
      reason: [
        `${engine} is detectable, but image execution remains disabled`,
        'until a later backend slice enforces container isolation controls.',
      ].join(' '),
    }
  }
  return {
    engine,
    status: availability.status,
    ...(availability.version === undefined ? {} : { version: availability.version }),
    reason: availability.reason ?? `${engine} is not available for sandbox container execution.`,
  }
}

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
      'No usable container engine is enabled for sandbox execution.',
      `Docker: ${docker.reason}`,
      `Podman: ${podman.reason}`,
    ].join(' '),
  }
}

function imagePolicyWarnings(engine: SandboxContainerEngineStatus): readonly string[] {
  return [
    'Container images are an explicit allowlist only; browser requests may not supply arbitrary image names.',
    'Images are never pulled automatically during normal sandbox execution.',
    'Default inventory marks images installed=false; local inspection can report allowlisted image-store metadata separately.',
    'Container execution remains unavailable until a backend enforces no network, dropped capabilities, and non-root execution.',
    'Container execution policy also requires bounded CPU/memory/PIDs and a read-only root filesystem where workable.',
    'Container execution policy also forbids host socket mounts.',
    engine.status === 'available'
      ? [
          `${engine.engine} was detected for future capability evaluation.`,
          'This PR does not execute containers.',
        ].join(' ')
      : engine.reason,
  ]
}

export function buildSandboxImagePolicy(
  commandAvailability: ReadonlyMap<string, SandboxRunnerAvailability> = new Map(),
): SandboxImagePolicySummary {
  const engine = selectContainerEngine(commandAvailability)
  const images = DEFAULT_SANDBOX_IMAGE_ALLOWLIST.map((image) => ({
    ...image,
    enabled: false,
    installed: false,
  }))
  return {
    engine,
    images,
    warnings: imagePolicyWarnings(engine),
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
