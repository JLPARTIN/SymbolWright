import { createHash } from 'node:crypto'

import {
  isUrlAllowedByRegistryPolicy,
  type EffectiveDependencyPolicy,
} from './dependency-policy.js'

export const NPM_DEPENDENCY_PLAN_SCHEMA_VERSION = 1 as const

export interface NpmDependencyArtifact {
  readonly packagePath: string
  readonly name: string
  readonly version: string
  readonly resolvedUrl: string
  readonly integrity: string
  readonly integrityAlgorithm: 'sha256' | 'sha384' | 'sha512'
  readonly integrityDigestHex: string
  readonly cacheKey: string
  readonly hasInstallScript: boolean
  readonly development: boolean
  readonly optional: boolean
}

export interface NpmDependencyPlan {
  readonly schemaVersion: typeof NPM_DEPENDENCY_PLAN_SCHEMA_VERSION
  readonly ecosystem: 'npm'
  readonly policyId: string
  readonly policyVersion: number
  readonly policyFingerprint: string
  readonly packageJsonSha256: string
  readonly packageLockSha256: string
  readonly lockfileVersion: 2 | 3
  readonly packageName?: string
  readonly packageVersion?: string
  readonly artifacts: readonly NpmDependencyArtifact[]
  readonly packageCount: number
  readonly lifecycleScriptsSuppressedDuringAcquisition: true
  readonly lockfileMutationAllowed: false
  readonly offlineInstall: {
    readonly binary: 'npm'
    readonly args: readonly string[]
    readonly environment: Readonly<Record<string, string>>
    readonly networkRequired: false
  }
  readonly sbom: NpmDependencySbom
}

export interface NpmDependencySbom {
  readonly bomFormat: 'CycloneDX'
  readonly specVersion: '1.6'
  readonly version: 1
  readonly metadata: {
    readonly component?: {
      readonly type: 'application'
      readonly name: string
      readonly version?: string
    }
    readonly properties: readonly {
      readonly name: string
      readonly value: string
    }[]
  }
  readonly components: readonly {
    readonly type: 'library'
    readonly name: string
    readonly version: string
    readonly purl: string
    readonly hashes: readonly {
      readonly alg: 'SHA-256' | 'SHA-384' | 'SHA-512'
      readonly content: string
    }[]
    readonly properties: readonly {
      readonly name: string
      readonly value: string
    }[]
  }[]
}

export class NpmDependencyPlanError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'NpmDependencyPlanError'
    this.code = code
  }
}

interface PackageJsonDocument {
  readonly name?: unknown
  readonly version?: unknown
  readonly dependencies?: unknown
  readonly devDependencies?: unknown
  readonly optionalDependencies?: unknown
  readonly peerDependencies?: unknown
}

interface PackageLockPackage {
  readonly name?: unknown
  readonly version?: unknown
  readonly resolved?: unknown
  readonly integrity?: unknown
  readonly link?: unknown
  readonly dev?: unknown
  readonly optional?: unknown
  readonly hasInstallScript?: unknown
  readonly dependencies?: unknown
  readonly devDependencies?: unknown
  readonly optionalDependencies?: unknown
  readonly peerDependencies?: unknown
}

interface PackageLockDocument {
  readonly name?: unknown
  readonly version?: unknown
  readonly lockfileVersion?: unknown
  readonly packages?: unknown
}

export function createNpmDependencyPlan(input: {
  readonly packageJsonText: string
  readonly packageLockText: string
  readonly policy: EffectiveDependencyPolicy
}): NpmDependencyPlan {
  if (input.policy.ecosystem !== 'npm') {
    throw new NpmDependencyPlanError(
      'NPM_POLICY_ECOSYSTEM_MISMATCH',
      `Cannot build an npm plan from ${input.policy.ecosystem} policy.`,
    )
  }
  if (!input.policy.requireLockfile || input.policy.allowLockfileMutation) {
    throw new NpmDependencyPlanError(
      'NPM_POLICY_NOT_LOCKFILE_IMMUTABLE',
      'The effective policy must require an immutable lockfile.',
    )
  }
  if (!input.policy.suppressLifecycleScripts) {
    throw new NpmDependencyPlanError(
      'NPM_POLICY_LIFECYCLE_SCRIPTS_UNSAFE',
      'Lifecycle scripts must be suppressed during dependency acquisition.',
    )
  }

  const packageJson = parseJsonObject<PackageJsonDocument>(
    input.packageJsonText,
    'NPM_PACKAGE_JSON_INVALID',
    'package.json',
  )
  const packageLock = parseJsonObject<PackageLockDocument>(
    input.packageLockText,
    'NPM_LOCKFILE_INVALID',
    'package-lock.json',
  )
  const lockfileVersion = parseLockfileVersion(packageLock.lockfileVersion)
  const packages = parsePackages(packageLock.packages)
  const root = packages['']
  if (root === undefined) {
    throw new NpmDependencyPlanError(
      'NPM_LOCKFILE_ROOT_MISSING',
      'package-lock.json must contain the root packages entry.',
    )
  }

  verifyRootIdentity(packageJson, packageLock, root)
  verifyRootDependencySpec(packageJson, root)

  const artifacts = Object.entries(packages)
    .filter(([packagePath, entry]) => packagePath.length > 0 && entry.link !== true)
    .map(([packagePath, entry]) => parseArtifact(packagePath, entry, input.policy))
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name)
      return byName === 0 ? left.packagePath.localeCompare(right.packagePath) : byName
    })

  if (artifacts.length > input.policy.limits.maxPackages) {
    throw new NpmDependencyPlanError(
      'NPM_PACKAGE_QUOTA_EXCEEDED',
      `Lockfile contains ${artifacts.length} packages; policy allows ${input.policy.limits.maxPackages}.`,
    )
  }

  const packageName = optionalNonEmptyString(packageJson.name)
  const packageVersion = optionalNonEmptyString(packageJson.version)
  const metadataComponent =
    packageName === undefined
      ? undefined
      : {
          type: 'application' as const,
          name: packageName,
          ...(packageVersion === undefined ? {} : { version: packageVersion }),
        }

  return deepFreeze({
    schemaVersion: NPM_DEPENDENCY_PLAN_SCHEMA_VERSION,
    ecosystem: 'npm',
    policyId: input.policy.policyId,
    policyVersion: input.policy.policyVersion,
    policyFingerprint: input.policy.fingerprint,
    packageJsonSha256: sha256(input.packageJsonText),
    packageLockSha256: sha256(input.packageLockText),
    lockfileVersion,
    ...(packageName === undefined ? {} : { packageName }),
    ...(packageVersion === undefined ? {} : { packageVersion }),
    artifacts,
    packageCount: artifacts.length,
    lifecycleScriptsSuppressedDuringAcquisition: true,
    lockfileMutationAllowed: false,
    offlineInstall: {
      binary: 'npm',
      args: ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
      environment: {
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_ignore_scripts: 'true',
        npm_config_offline: 'true',
        npm_config_update_notifier: 'false',
      },
      networkRequired: false,
    },
    sbom: {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      metadata: {
        ...(metadataComponent === undefined ? {} : { component: metadataComponent }),
        properties: [
          { name: 'symbolwright:dependency-policy-id', value: input.policy.policyId },
          {
            name: 'symbolwright:dependency-policy-version',
            value: String(input.policy.policyVersion),
          },
          {
            name: 'symbolwright:package-lock-sha256',
            value: sha256(input.packageLockText),
          },
        ],
      },
      components: artifacts.map((artifact) => ({
        type: 'library' as const,
        name: artifact.name,
        version: artifact.version,
        purl: `pkg:npm/${encodePackageNameForPurl(artifact.name)}@${encodeURIComponent(artifact.version)}`,
        hashes: [
          {
            alg: integrityAlgorithmForSbom(artifact.integrityAlgorithm),
            content: artifact.integrityDigestHex,
          },
        ],
        properties: [
          { name: 'symbolwright:resolved-url', value: artifact.resolvedUrl },
          {
            name: 'symbolwright:has-install-script',
            value: String(artifact.hasInstallScript),
          },
          { name: 'symbolwright:development', value: String(artifact.development) },
          { name: 'symbolwright:optional', value: String(artifact.optional) },
        ],
      })),
    },
  })
}

export function assertNpmDependencyPlanInputsUnchanged(input: {
  readonly plan: NpmDependencyPlan
  readonly packageJsonText: string
  readonly packageLockText: string
}): void {
  if (sha256(input.packageJsonText) !== input.plan.packageJsonSha256) {
    throw new NpmDependencyPlanError(
      'NPM_PACKAGE_JSON_DRIFT',
      'package.json changed after dependency policy authorization.',
    )
  }
  if (sha256(input.packageLockText) !== input.plan.packageLockSha256) {
    throw new NpmDependencyPlanError(
      'NPM_LOCKFILE_DRIFT',
      'package-lock.json changed after dependency policy authorization.',
    )
  }
}

function parseArtifact(
  packagePath: string,
  entry: PackageLockPackage,
  policy: EffectiveDependencyPolicy,
): NpmDependencyArtifact {
  const name = optionalNonEmptyString(entry.name) ?? packageNameFromPath(packagePath)
  const version = requiredNonEmptyString(
    entry.version,
    'NPM_PACKAGE_VERSION_MISSING',
    `${packagePath} does not declare a package version.`,
  )
  const resolvedUrl = requiredNonEmptyString(
    entry.resolved,
    'NPM_PACKAGE_SOURCE_MISSING',
    `${packagePath} does not declare an immutable resolved URL.`,
  )
  if (!isUrlAllowedByRegistryPolicy(resolvedUrl, policy.allowedRegistries)) {
    throw new NpmDependencyPlanError(
      'NPM_PACKAGE_SOURCE_NOT_ALLOWED',
      `${packagePath} resolves outside the dependency registry allowlist.`,
    )
  }
  const integrity = requiredNonEmptyString(
    entry.integrity,
    'NPM_PACKAGE_INTEGRITY_MISSING',
    `${packagePath} does not declare lockfile integrity.`,
  )
  const parsedIntegrity = parseSubresourceIntegrity(integrity)

  return {
    packagePath,
    name,
    version,
    resolvedUrl,
    integrity,
    integrityAlgorithm: parsedIntegrity.algorithm,
    integrityDigestHex: parsedIntegrity.digestHex,
    cacheKey: `${parsedIntegrity.algorithm}-${parsedIntegrity.digestHex}`,
    hasInstallScript: entry.hasInstallScript === true,
    development: entry.dev === true,
    optional: entry.optional === true,
  }
}

function parseSubresourceIntegrity(value: string): {
  readonly algorithm: 'sha256' | 'sha384' | 'sha512'
  readonly digestHex: string
} {
  const candidates = value
    .trim()
    .split(/\s+/)
    .map((token) => {
      const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})(?:\?.*)?$/.exec(token)
      if (match === null) return undefined
      const algorithm = match[1] as 'sha256' | 'sha384' | 'sha512'
      const encoded = match[2]
      if (encoded === undefined || encoded.length === 0) return undefined
      const bytes = Buffer.from(encoded, 'base64')
      if (bytes.byteLength === 0 || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
        return undefined
      }
      return { algorithm, digestHex: bytes.toString('hex') }
    })
    .filter(
      (
        candidate,
      ): candidate is {
        readonly algorithm: 'sha256' | 'sha384' | 'sha512'
        readonly digestHex: string
      } => candidate !== undefined,
    )
    .sort((left, right) => integrityStrength(right.algorithm) - integrityStrength(left.algorithm))

  const strongest = candidates[0]
  if (strongest === undefined) {
    throw new NpmDependencyPlanError(
      'NPM_PACKAGE_INTEGRITY_INVALID',
      'Lockfile integrity must contain a valid sha256, sha384, or sha512 digest.',
    )
  }
  return strongest
}

function verifyRootIdentity(
  packageJson: PackageJsonDocument,
  packageLock: PackageLockDocument,
  root: PackageLockPackage,
): void {
  const packageName = optionalNonEmptyString(packageJson.name)
  const lockName = optionalNonEmptyString(packageLock.name)
  const rootName = optionalNonEmptyString(root.name)
  if (packageName !== undefined && lockName !== undefined && packageName !== lockName) {
    throw new NpmDependencyPlanError(
      'NPM_LOCKFILE_IDENTITY_MISMATCH',
      'package-lock.json name does not match package.json.',
    )
  }
  if (packageName !== undefined && rootName !== undefined && packageName !== rootName) {
    throw new NpmDependencyPlanError(
      'NPM_LOCKFILE_IDENTITY_MISMATCH',
      'The root lockfile package name does not match package.json.',
    )
  }

  const packageVersion = optionalNonEmptyString(packageJson.version)
  const lockVersion = optionalNonEmptyString(packageLock.version)
  const rootVersion = optionalNonEmptyString(root.version)
  if (packageVersion !== undefined && lockVersion !== undefined && packageVersion !== lockVersion) {
    throw new NpmDependencyPlanError(
      'NPM_LOCKFILE_IDENTITY_MISMATCH',
      'package-lock.json version does not match package.json.',
    )
  }
  if (packageVersion !== undefined && rootVersion !== undefined && packageVersion !== rootVersion) {
    throw new NpmDependencyPlanError(
      'NPM_LOCKFILE_IDENTITY_MISMATCH',
      'The root lockfile package version does not match package.json.',
    )
  }
}

function verifyRootDependencySpec(
  packageJson: PackageJsonDocument,
  root: PackageLockPackage,
): void {
  for (const key of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const) {
    const declared = normalizeStringRecord(packageJson[key], key)
    const locked = normalizeStringRecord(root[key], `lockfile root ${key}`)
    if (stableJson(declared) !== stableJson(locked)) {
      throw new NpmDependencyPlanError(
        'NPM_LOCKFILE_DEPENDENCY_DRIFT',
        `The root lockfile ${key} do not match package.json.`,
      )
    }
  }
}

function parsePackages(value: unknown): Readonly<Record<string, PackageLockPackage>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NpmDependencyPlanError(
      'NPM_LOCKFILE_PACKAGES_MISSING',
      'package-lock.json must contain a packages object.',
    )
  }
  return value as Record<string, PackageLockPackage>
}

function parseLockfileVersion(value: unknown): 2 | 3 {
  if (value === 2 || value === 3) return value
  throw new NpmDependencyPlanError(
    'NPM_LOCKFILE_VERSION_UNSUPPORTED',
    'Only npm package-lock versions 2 and 3 are supported.',
  )
}

function parseJsonObject<T extends object>(
  text: string,
  code: string,
  label: string,
): T {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new NpmDependencyPlanError(code, `${label} is not valid JSON.`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NpmDependencyPlanError(code, `${label} must contain a JSON object.`)
  }
  return value as T
}

function normalizeStringRecord(value: unknown, label: string): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NpmDependencyPlanError(
      'NPM_DEPENDENCY_SPEC_INVALID',
      `${label} must be an object of package specifiers.`,
    )
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([name, specifier]) => {
      if (typeof specifier !== 'string' || specifier.trim().length === 0) {
        throw new NpmDependencyPlanError(
          'NPM_DEPENDENCY_SPEC_INVALID',
          `${label}.${name} must be a non-empty string.`,
        )
      }
      return [name, specifier] as const
    })
    .sort(([left], [right]) => left.localeCompare(right))
  return Object.fromEntries(entries)
}

function packageNameFromPath(packagePath: string): string {
  const marker = 'node_modules/'
  const index = packagePath.lastIndexOf(marker)
  const name = index < 0 ? packagePath : packagePath.slice(index + marker.length)
  if (name.length === 0 || name.includes('node_modules/')) {
    throw new NpmDependencyPlanError(
      'NPM_PACKAGE_NAME_INVALID',
      `Cannot derive a package name from lockfile path ${packagePath}.`,
    )
  }
  return name
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function requiredNonEmptyString(
  value: unknown,
  code: string,
  message: string,
): string {
  const parsed = optionalNonEmptyString(value)
  if (parsed === undefined) throw new NpmDependencyPlanError(code, message)
  return parsed
}

function encodePackageNameForPurl(name: string): string {
  return name
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function integrityAlgorithmForSbom(
  algorithm: 'sha256' | 'sha384' | 'sha512',
): 'SHA-256' | 'SHA-384' | 'SHA-512' {
  if (algorithm === 'sha256') return 'SHA-256'
  if (algorithm === 'sha384') return 'SHA-384'
  return 'SHA-512'
}

function integrityStrength(algorithm: 'sha256' | 'sha384' | 'sha512'): number {
  if (algorithm === 'sha512') return 3
  if (algorithm === 'sha384') return 2
  return 1
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
