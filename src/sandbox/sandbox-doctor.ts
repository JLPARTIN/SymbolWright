import { DEFAULT_SANDBOX_DISCOVERY_PROBES, discoverRuntimeCommands } from './sandbox-discovery.js'
import { buildSandboxImagePolicy, type SandboxContainerEngineStatus } from './sandbox-images.js'
import { buildSandboxInventory } from './sandbox-registry.js'
import type {
  SandboxImageDefinition,
  SandboxInventory,
  SandboxRunnerAvailability,
  SandboxRunnerDefinition,
} from './sandbox-types.js'

export const SANDBOX_DOCTOR_BLOCK_ID = 'SYMBOLWRIGHT-SANDBOX-DOCTOR-01' as const

export interface SandboxRuntimeDoctorEntry {
  readonly id: string
  readonly languages: readonly string[]
  readonly trustClass: string
  readonly backend: string
  readonly status: string
  readonly version?: string
  readonly reason?: string
  readonly networkPolicy: string
}

export interface SandboxImageDoctorEntry {
  readonly id: string
  readonly image: string
  readonly digest?: string
  readonly languages: readonly string[]
  readonly enabled: boolean
  readonly installed: boolean
  readonly preparationCommand?: string
}

export interface SandboxDoctorReport {
  readonly blockId: typeof SANDBOX_DOCTOR_BLOCK_ID
  readonly generatedAt: string
  readonly readOnly: true
  readonly executionEnabled: boolean
  readonly guardedHostOptIn: boolean
  readonly strongContainerOptIn: boolean
  readonly containerEngine: SandboxContainerEngineStatus
  readonly runtimes: readonly SandboxRuntimeDoctorEntry[]
  readonly images: readonly SandboxImageDoctorEntry[]
  readonly preparationCommands: readonly string[]
  readonly warnings: readonly string[]
}

export interface SandboxDoctorOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly now?: () => Date
  readonly discoverCommandAvailability?: () => Promise<
    ReadonlyMap<string, SandboxRunnerAvailability>
  >
}

function runtimeEntry(runner: SandboxRunnerDefinition): SandboxRuntimeDoctorEntry {
  return {
    id: runner.id,
    languages: runner.languageIds,
    trustClass: runner.trustClass,
    backend: runner.backend,
    status: runner.availability.status,
    ...(runner.availability.version === undefined ? {} : { version: runner.availability.version }),
    ...(runner.availability.reason === undefined ? {} : { reason: runner.availability.reason }),
    networkPolicy: runner.networkPolicy,
  }
}

function imagePreparationCommand(
  engine: SandboxContainerEngineStatus,
  image: SandboxImageDefinition,
): string | undefined {
  if (engine.engine === 'none') return undefined
  return `${engine.engine} pull ${image.image}`
}

function imageEntry(
  engine: SandboxContainerEngineStatus,
  image: SandboxImageDefinition,
): SandboxImageDoctorEntry {
  const preparationCommand = imagePreparationCommand(engine, image)
  return {
    id: image.id,
    image: image.image,
    ...(image.digest === undefined ? {} : { digest: image.digest }),
    languages: image.languages,
    enabled: image.enabled,
    installed: image.installed === true,
    ...(preparationCommand === undefined ? {} : { preparationCommand }),
  }
}

function preparationCommands(images: readonly SandboxImageDoctorEntry[]): readonly string[] {
  return images.flatMap((image) =>
    image.preparationCommand === undefined ? [] : [image.preparationCommand],
  )
}

function reportWarnings(inventory: SandboxInventory): readonly string[] {
  return [
    'Sandbox doctor is read-only: it does not run repository code, pull images, install dependencies, or execute containers.',
    'Image preparation commands are operator-reviewed hints only and are never run automatically.',
    ...inventory.warnings,
  ]
}

export async function buildSandboxDoctorReport(
  options: SandboxDoctorOptions = {},
): Promise<SandboxDoctorReport> {
  const env = options.env ?? process.env
  const now = options.now ?? (() => new Date())
  const commandAvailability = await (options.discoverCommandAvailability?.() ??
    discoverRuntimeCommands(DEFAULT_SANDBOX_DISCOVERY_PROBES, { env }))
  const inventory = buildSandboxInventory({
    env,
    now,
    commandAvailability,
  })
  const imagePolicy = buildSandboxImagePolicy(commandAvailability, env)
  const images = imagePolicy.images.map((image) => imageEntry(imagePolicy.engine, image))
  const executionEnabled = inventory.runners.some(
    (runner) =>
      runner.backend === 'container' &&
      runner.trustClass === 'container-isolated' &&
      runner.availability.status === 'available',
  )

  return {
    blockId: SANDBOX_DOCTOR_BLOCK_ID,
    generatedAt: now().toISOString(),
    readOnly: true,
    executionEnabled,
    guardedHostOptIn: env['SYMBOLWRIGHT_ALLOW_GUARDED_HOST_EXECUTION'] === 'true',
    strongContainerOptIn: env['SYMBOLWRIGHT_ENABLE_STRONG_CONTAINER_EXECUTION'] === 'true',
    containerEngine: imagePolicy.engine,
    runtimes: inventory.runners.map(runtimeEntry),
    images,
    preparationCommands: preparationCommands(images),
    warnings: reportWarnings(inventory),
  }
}

function renderRuntime(entry: SandboxRuntimeDoctorEntry): string {
  const version = entry.version === undefined ? '' : ` version=${entry.version}`
  const reason = entry.reason === undefined ? '' : ` — ${entry.reason}`
  return `  - ${entry.id}: ${entry.status}${version}; ${entry.trustClass}/${entry.backend}; network=${entry.networkPolicy}${reason}`
}

function renderImage(entry: SandboxImageDoctorEntry): string {
  const command =
    entry.preparationCommand === undefined
      ? 'no preparation command until an engine is detected'
      : entry.preparationCommand
  const digest = entry.digest === undefined ? 'unpinned' : entry.digest
  return `  - ${entry.id}: ${entry.image}; digest=${digest}; enabled=${entry.enabled}; installed=${entry.installed}; languages=${entry.languages.join(', ')}; prepare=${command}`
}

export function renderSandboxDoctorReport(report: SandboxDoctorReport): string {
  const lines = [
    'SymbolWright Sandbox Doctor',
    '',
    `Block: ${report.blockId}`,
    `Generated: ${report.generatedAt}`,
    `Mode: READ-ONLY DIAGNOSTIC`,
    `Strong container execution ready: ${report.executionEnabled}`,
    `Strong-container opt-in: ${report.strongContainerOptIn}`,
    `Guarded-host opt-in: ${report.guardedHostOptIn}`,
    '',
    'Container engine:',
    `  ${report.containerEngine.engine}: ${report.containerEngine.status}${
      report.containerEngine.version === undefined
        ? ''
        : ` version=${report.containerEngine.version}`
    }`,
    `  ${report.containerEngine.reason}`,
    '',
    'Runtime inventory:',
    ...report.runtimes.map(renderRuntime),
    '',
    'Image allowlist:',
    ...report.images.map(renderImage),
    '',
    'Operator-reviewed preparation commands:',
    ...(report.preparationCommands.length === 0
      ? ['  - none: no container engine is available or image inspection is not ready']
      : report.preparationCommands.map((command) => `  - ${command}`)),
    '',
    'Warnings:',
    ...report.warnings.map((warning) => `  - ${warning}`),
  ]
  return lines.join('\n')
}

export async function renderSandboxDoctorCommand(
  options: SandboxDoctorOptions = {},
): Promise<string> {
  return renderSandboxDoctorReport(await buildSandboxDoctorReport(options))
}

export function renderSandboxImagesReport(report: SandboxDoctorReport): string {
  return [
    'SymbolWright Sandbox Images',
    '',
    `Container engine: ${report.containerEngine.engine} (${report.containerEngine.status})`,
    `Strong container execution ready: ${report.executionEnabled}`,
    'Images:',
    ...report.images.map(renderImage),
    '',
    'Preparation commands are shown for operator review only. SymbolWright does not pull images automatically.',
  ].join('\n')
}

export async function renderSandboxImagesCommand(
  options: SandboxDoctorOptions = {},
): Promise<string> {
  return renderSandboxImagesReport(await buildSandboxDoctorReport(options))
}
