import { DEFAULT_SANDBOX_DISCOVERY_PROBES, discoverRuntimeCommands } from './sandbox-discovery.js'
import { inspectSandboxLocalImage } from './sandbox-image-store.js'
import { buildSandboxImagePolicy, findSandboxImage } from './sandbox-images.js'
import type { SandboxLocalImageInspection } from './sandbox-image-store.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import type { SandboxImageDefinition, SandboxRunnerAvailability } from './sandbox-types.js'

export interface SandboxImageCommandOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly discoverCommandAvailability?: () => Promise<
    ReadonlyMap<string, SandboxRunnerAvailability>
  >
  readonly inspectLocalImage?: (
    image: SandboxImageDefinition,
    engine: SandboxContainerEngineStatus,
  ) => Promise<SandboxLocalImageInspection>
}

interface ResolvedImagePolicy {
  readonly engine: SandboxContainerEngineStatus
  readonly images: readonly SandboxImageDefinition[]
  readonly warnings: readonly string[]
}

async function resolveImagePolicy(
  options: SandboxImageCommandOptions = {},
): Promise<ResolvedImagePolicy> {
  const env = options.env ?? process.env
  const discoveredAvailability = options.discoverCommandAvailability?.()
  const commandAvailability =
    discoveredAvailability === undefined
      ? await discoverRuntimeCommands(DEFAULT_SANDBOX_DISCOVERY_PROBES, { env })
      : await discoveredAvailability

  return buildSandboxImagePolicy(commandAvailability, env)
}

function renderImageIds(images: readonly SandboxImageDefinition[]): string {
  return images.map((image) => image.id).join(', ')
}

function renderMissingImageId(action: string, images: readonly SandboxImageDefinition[]): string {
  return [
    `Missing sandbox image id for: symbolwright sandbox ${action} <image-id>`,
    '',
    `Allowed image IDs: ${renderImageIds(images)}`,
    'Image IDs must come from the built-in allowlist. Raw image names are not accepted.',
  ].join('\n')
}

function renderUnknownImageId(imageId: string, images: readonly SandboxImageDefinition[]): string {
  return [
    `Unknown sandbox image id: ${imageId}`,
    '',
    `Allowed image IDs: ${renderImageIds(images)}`,
    'Browser and CLI requests may not supply arbitrary container image names.',
  ].join('\n')
}

function renderOptionalMetadata(
  label: string,
  value: string | number | undefined,
): string | undefined {
  return value === undefined ? undefined : `${label}: ${value}`
}

async function resolveLocalImageInspection(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
  options: SandboxImageCommandOptions,
): Promise<SandboxLocalImageInspection> {
  if (options.inspectLocalImage !== undefined) return options.inspectLocalImage(image, engine)
  return inspectSandboxLocalImage(
    image,
    engine,
    options.env === undefined ? {} : { env: options.env },
  )
}

async function renderImageInspection(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
  options: SandboxImageCommandOptions,
): Promise<string> {
  const localInspection = await resolveLocalImageInspection(image, engine, options)
  const optionalMetadata = [
    renderOptionalMetadata('Local image size bytes', localInspection.sizeBytes),
    renderOptionalMetadata('Local image digest', localInspection.digest),
  ].filter((line): line is string => line !== undefined)

  return [
    'SymbolWright Sandbox Image Inspection',
    '',
    `Image ID: ${image.id}`,
    `Image: ${image.image}`,
    `Languages: ${image.languages.join(', ')}`,
    `Enabled: ${image.enabled}`,
    `Installed: ${localInspection.status === 'installed'}`,
    `Local store status: ${localInspection.status}`,
    `Local store detail: ${localInspection.reason}`,
    ...optionalMetadata,
    `Source: ${image.source}`,
    `Container engine: ${engine.engine} (${engine.status})`,
    `Engine detail: ${engine.reason}`,
    '',
    'Safety:',
    '  This command is read-only and does not acquire, run, or mutate images.',
    '  Local image inspection reads allowlisted image metadata only.',
    '  Manual image preparation remains an operator-reviewed task.',
  ].join('\n')
}

function renderImagePreparationPlan(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
): string {
  return [
    'SymbolWright Sandbox Image Preparation Plan',
    '',
    `Image ID: ${image.id}`,
    `Image: ${image.image}`,
    `Languages: ${image.languages.join(', ')}`,
    `Container engine: ${engine.engine} (${engine.status})`,
    engine.status === 'available' ? 'Status: REVIEW_REQUIRED' : 'Status: BLOCKED',
    engine.status === 'available'
      ? 'Reason: prepare this allowlisted image manually after reviewing local policy.'
      : `Reason: ${engine.reason}`,
    '',
    'Safety:',
    '  SymbolWright does not execute this plan automatically.',
    '  Normal sandbox execution still forbids automatic image acquisition.',
    '  Raw image names, registry credentials, and arbitrary container flags are not accepted.',
  ].join('\n')
}

export async function renderSandboxImageInspectCommand(
  args: readonly string[],
  options: SandboxImageCommandOptions = {},
): Promise<string> {
  const policy = await resolveImagePolicy(options)
  const [imageId] = args
  if (imageId === undefined) return renderMissingImageId('inspect', policy.images)

  const image = findSandboxImage(policy.images, imageId)
  if (image === undefined) return renderUnknownImageId(imageId, policy.images)

  return renderImageInspection(image, policy.engine, options)
}

export async function renderSandboxImagePrepareCommand(
  args: readonly string[],
  options: SandboxImageCommandOptions = {},
): Promise<string> {
  const policy = await resolveImagePolicy(options)
  const [imageId] = args
  if (imageId === undefined) return renderMissingImageId('prepare', policy.images)

  const image = findSandboxImage(policy.images, imageId)
  if (image === undefined) return renderUnknownImageId(imageId, policy.images)

  return renderImagePreparationPlan(image, policy.engine)
}
