import { describe, expect, it } from 'vitest'

import type { EffectiveDependencyPolicy } from './dependency-policy.js'
import {
  NpmDependencyPlanError,
  assertNpmDependencyPlanInputsUnchanged,
  createNpmDependencyPlan,
} from './npm-dependency-plan.js'

const POLICY: EffectiveDependencyPolicy = {
  schemaVersion: 1,
  policyId: 'npm-production',
  policyVersion: 3,
  fingerprint: 'f'.repeat(64),
  resolvedAt: '2026-07-29T00:00:00.000Z',
  ecosystem: 'npm',
  deploymentMode: 'hosted',
  callerKind: 'delegated-grant',
  capabilityId: 'symbolwright.dependencies.acquire',
  allowedRegistries: ['https://registry.npmjs.org/'],
  requireLockfile: true,
  allowLockfileMutation: false,
  suppressLifecycleScripts: true,
  directIpDestinations: 'denied',
  cacheNamespace: 'npm-production-v3',
  limits: {
    maxPackages: 10,
    maxRequests: 20,
    maxArchiveBytes: 1_000_000,
    maxExpandedBytes: 10_000_000,
    maxFiles: 1_000,
    maxFileBytes: 1_000_000,
    maxTotalBytes: 20_000_000,
    timeoutMs: 60_000,
    maxConcurrency: 2,
  },
  sources: [
    { id: 'dependency-global', version: 1, kind: 'global' },
    { id: 'npm-production', version: 3, kind: 'operator-profile' },
  ],
}

const PACKAGE_JSON = JSON.stringify({
  name: 'fixture-app',
  version: '1.0.0',
  dependencies: { alpha: '^1.0.0' },
  devDependencies: { beta: '^2.0.0' },
})

const ALPHA_INTEGRITY = `sha512-${Buffer.from('alpha-digest').toString('base64')}`
const BETA_INTEGRITY = `sha512-${Buffer.from('beta-digest').toString('base64')}`

function packageLock(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'fixture-app',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'fixture-app',
        version: '1.0.0',
        dependencies: { alpha: '^1.0.0' },
        devDependencies: { beta: '^2.0.0' },
      },
      'node_modules/alpha': {
        version: '1.2.3',
        resolved: 'https://registry.npmjs.org/alpha/-/alpha-1.2.3.tgz',
        integrity: ALPHA_INTEGRITY,
        hasInstallScript: true,
      },
      'node_modules/beta': {
        version: '2.4.0',
        resolved: 'https://registry.npmjs.org/beta/-/beta-2.4.0.tgz',
        integrity: BETA_INTEGRITY,
        dev: true,
      },
    },
    ...overrides,
  })
}

describe('npm dependency acquisition plan', () => {
  it('creates a lockfile-bound offline handoff plan and CycloneDX manifest', () => {
    const lockText = packageLock()
    const plan = createNpmDependencyPlan({
      packageJsonText: PACKAGE_JSON,
      packageLockText: lockText,
      policy: POLICY,
    })

    expect(plan).toMatchObject({
      ecosystem: 'npm',
      policyId: POLICY.policyId,
      policyVersion: POLICY.policyVersion,
      packageName: 'fixture-app',
      packageVersion: '1.0.0',
      packageCount: 2,
      lifecycleScriptsSuppressedDuringAcquisition: true,
      lockfileMutationAllowed: false,
      offlineInstall: {
        binary: 'npm',
        args: ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
        networkRequired: false,
      },
      sbom: {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        version: 1,
      },
    })
    expect(plan.artifacts[0]).toMatchObject({
      name: 'alpha',
      version: '1.2.3',
      hasInstallScript: true,
      development: false,
    })
    expect(plan.artifacts[1]).toMatchObject({
      name: 'beta',
      version: '2.4.0',
      development: true,
    })
    expect(plan.sbom.components).toHaveLength(2)
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.artifacts)).toBe(true)
  })

  it('rejects package.json and lockfile dependency drift', () => {
    const driftingLock = packageLock({
      packages: {
        '': {
          name: 'fixture-app',
          version: '1.0.0',
          dependencies: { alpha: '^9.0.0' },
          devDependencies: { beta: '^2.0.0' },
        },
      },
    })

    expect(() =>
      createNpmDependencyPlan({
        packageJsonText: PACKAGE_JSON,
        packageLockText: driftingLock,
        policy: POLICY,
      }),
    ).toThrowError(
      expect.objectContaining<NpmDependencyPlanError>({
        code: 'NPM_LOCKFILE_DEPENDENCY_DRIFT',
      }),
    )
  })

  it('rejects disallowed package sources and missing integrity', () => {
    const disallowed = JSON.stringify({
      name: 'fixture-app',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'fixture-app',
          version: '1.0.0',
          dependencies: { alpha: '^1.0.0' },
          devDependencies: { beta: '^2.0.0' },
        },
        'node_modules/alpha': {
          version: '1.2.3',
          resolved: 'https://evil.example/alpha.tgz',
          integrity: ALPHA_INTEGRITY,
        },
        'node_modules/beta': {
          version: '2.4.0',
          resolved: 'https://registry.npmjs.org/beta/-/beta-2.4.0.tgz',
          integrity: BETA_INTEGRITY,
        },
      },
    })
    const missingIntegrity = JSON.stringify({
      name: 'fixture-app',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'fixture-app',
          version: '1.0.0',
          dependencies: { alpha: '^1.0.0' },
          devDependencies: { beta: '^2.0.0' },
        },
        'node_modules/alpha': {
          version: '1.2.3',
          resolved: 'https://registry.npmjs.org/alpha/-/alpha-1.2.3.tgz',
        },
        'node_modules/beta': {
          version: '2.4.0',
          resolved: 'https://registry.npmjs.org/beta/-/beta-2.4.0.tgz',
          integrity: BETA_INTEGRITY,
        },
      },
    })

    expectPlanError(disallowed, 'NPM_PACKAGE_SOURCE_NOT_ALLOWED')
    expectPlanError(missingIntegrity, 'NPM_PACKAGE_INTEGRITY_MISSING')
  })

  it('enforces the package-count quota before acquisition starts', () => {
    const restrictivePolicy: EffectiveDependencyPolicy = {
      ...POLICY,
      limits: { ...POLICY.limits, maxPackages: 1 },
    }

    expect(() =>
      createNpmDependencyPlan({
        packageJsonText: PACKAGE_JSON,
        packageLockText: packageLock(),
        policy: restrictivePolicy,
      }),
    ).toThrowError(
      expect.objectContaining<NpmDependencyPlanError>({
        code: 'NPM_PACKAGE_QUOTA_EXCEEDED',
      }),
    )
  })

  it('selects the strongest valid integrity digest for cache identity', () => {
    const sha256 = Buffer.from('weaker').toString('base64')
    const sha512 = Buffer.from('stronger').toString('base64')
    const lockText = JSON.stringify({
      name: 'fixture-app',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'fixture-app',
          version: '1.0.0',
          dependencies: { alpha: '^1.0.0' },
          devDependencies: { beta: '^2.0.0' },
        },
        'node_modules/alpha': {
          version: '1.2.3',
          resolved: 'https://registry.npmjs.org/alpha/-/alpha-1.2.3.tgz',
          integrity: `sha256-${sha256} sha512-${sha512}`,
        },
        'node_modules/beta': {
          version: '2.4.0',
          resolved: 'https://registry.npmjs.org/beta/-/beta-2.4.0.tgz',
          integrity: BETA_INTEGRITY,
        },
      },
    })

    const plan = createNpmDependencyPlan({
      packageJsonText: PACKAGE_JSON,
      packageLockText: lockText,
      policy: POLICY,
    })

    expect(plan.artifacts[0]?.integrityAlgorithm).toBe('sha512')
    expect(plan.artifacts[0]?.cacheKey).toMatch(/^sha512-/)
  })

  it('detects package and lockfile mutation after authorization', () => {
    const lockText = packageLock()
    const plan = createNpmDependencyPlan({
      packageJsonText: PACKAGE_JSON,
      packageLockText: lockText,
      policy: POLICY,
    })

    expect(() =>
      assertNpmDependencyPlanInputsUnchanged({
        plan,
        packageJsonText: `${PACKAGE_JSON}\n`,
        packageLockText: lockText,
      }),
    ).toThrowError(
      expect.objectContaining<NpmDependencyPlanError>({ code: 'NPM_PACKAGE_JSON_DRIFT' }),
    )
    expect(() =>
      assertNpmDependencyPlanInputsUnchanged({
        plan,
        packageJsonText: PACKAGE_JSON,
        packageLockText: `${lockText}\n`,
      }),
    ).toThrowError(
      expect.objectContaining<NpmDependencyPlanError>({ code: 'NPM_LOCKFILE_DRIFT' }),
    )
  })
})

function expectPlanError(packageLockText: string, code: string): void {
  try {
    createNpmDependencyPlan({
      packageJsonText: PACKAGE_JSON,
      packageLockText,
      policy: POLICY,
    })
    throw new Error('Expected npm dependency plan creation to fail.')
  } catch (error) {
    expect(error).toBeInstanceOf(NpmDependencyPlanError)
    expect((error as NpmDependencyPlanError).code).toBe(code)
  }
}
