import { DEFAULT_SANDBOX_DISCOVERY_PROBES, discoverRuntimeCommands } from './sandbox-discovery.js'
import { buildSandboxImagePolicy, findSandboxImage } from './sandbox-images.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'
import type { SandboxImageDefinition, SandboxRunnerAvailability } from './sandbox-types.js'

export interface SandboxImageCommandOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly discoverCommandAvailability?: () => Promise<ReadonlyMap<string, SandboxRunnerAvailability>>
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
  const commandAvailability = await (options.discoverCommandAvailability?.() ??
    discoverRuntimeCommands(DEFAULT_SANDBOX_DISCOVERY_PROBES, { env }))
  return buildSandboxImagePolicy(commandAvailability)
}

function renderImageIds(images: readonly SandboxImageDefinition[]): string {
  return images.map((image) => image.id).join(', ')
}

function renderMissingImageId(action: string, images: readonly SandboxImageDefinition[]): string {
  return [
    `Missing sandbox image id for: codemind sandbox ${action} <image-id>`,
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

function renderPreparationCommand(
  engine: SandboxContainerEngineStatus,
  image: SandboxImageDefinition,
): string | undefined {
  if (engine.engine === 'none' || engine.status !== 'available') return undefined
  return `${engine.engine} pull ${image.image}`
}

function renderImageInspection(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
): string {
  const preparationCommand = renderPreparationCommand(engine, image)
  return [
    'CodeMind Sandbox Image Inspection',
    '',
    `Image ID: ${image.id}`,
    `Image: ${image.image}`,
    `Languages: ${image.languages.join(', ')}`,
    `Enabled: ${image.enabled}`,
    `Installed: ${image.installed === true}`,
    `Source: ${image.source}`,
    `Container engine: ${engine.engine} (${engine.status})`,
    `Engine detail: ${engine.reason}`,
    '',
    'Preparation:',
    preparationCommand === undefined
      ? '  No preparation command is available until Docker or Podman is detected.'
      : `  ${preparationCommand}`,
    '',
    'Safety:',
    '  This command is read-only and does not inspect, pull, run, or mutate images.',
    '  The displayed preparation command is for operator review only.',
  ].join('\n')
}

function renderImagePreparationPlan(
  image: SandboxImageDefinition,
  engine: SandboxContainerEngineStatus,
): string {
  const preparationCommand = renderPreparationCommand(engine, image)
  const commandLines =
    preparationCommand === undefined
      ? [
          'Status: BLOCKED',
          `Reason: ${engine.reason}`,
          'No pull command is emitted because no usable container engine is available.',
        ]
      : [
          'Status: REVIEW_REQUIRED',
          `Command: ${preparationCommand}`,
          'Run this command manually only after reviewing the image policy and local environment.',
        ]

  return [
    'CodeMind Sandbox Image Preparation Plan',
    '',
    `Image ID: ${image.id}`,
    `Image: ${image.image}`,
    `Languages: ${image.languages.join(', ')}`,
    `Container engine: ${engine.engine} (${engine.status})`,
    ...commandLines,
    '',
    'Safety:',
    '  CodeMind does not execute this plan automatically.',
    '  Normal sandbox execution still forbids automatic image pulls.',
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

  return renderImageInspection(image, policy.engine)
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
