import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_EGRESS_POLICY_LIMITS, type EgressPolicyProfile } from './egress-policy.js'
import { loadEgressOperatorState } from './egress-operator-state.js'

const roots: string[] = []

const PROFILE: EgressPolicyProfile = {
  id: 'runtime-api',
  version: 1,
  enabled: true,
  deploymentModes: ['local', 'hosted'],
  callerKinds: ['operator', 'delegated-grant'],
  allowedHosts: ['api.example.com'],
  allowedMethods: ['GET'],
  allowedRequestHeaders: ['accept'],
  allowedPorts: [443],
  redirectPolicy: 'denied',
  credentialPolicy: 'none',
  requireTls: true,
  auditRetentionDays: 30,
  limits: DEFAULT_EGRESS_POLICY_LIMITS,
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'symbolwright-egress-state-'))
  roots.push(root)
  return root
}

describe('egress operator state', () => {
  it('is dependency-only and offline when no policy file is configured', () => {
    expect(loadEgressOperatorState({}, '/workspace')).toMatchObject({
      state: 'dependency-only',
      configured: false,
      policyFileConfigured: false,
      profileCount: 0,
    })
  })

  it('honors the independent emergency kill switch before reading a file', () => {
    expect(
      loadEgressOperatorState({
        SYMBOLWRIGHT_DISABLE_SANDBOX_EGRESS: 'true',
        SYMBOLWRIGHT_EGRESS_POLICY_FILE: 'missing.json',
      }),
    ).toMatchObject({
      state: 'disabled',
      globallyDisabled: true,
      policyFileConfigured: true,
    })
  })

  it('loads relative and absolute operator profile files without exposing destinations', async () => {
    const root = await workspace()
    const relativePath = 'egress-profiles.json'
    await fs.writeFile(path.join(root, relativePath), JSON.stringify([PROFILE]), 'utf8')

    const relative = loadEgressOperatorState(
      { SYMBOLWRIGHT_EGRESS_POLICY_FILE: relativePath },
      root,
    )
    expect(relative).toMatchObject({
      state: 'allowlisted',
      configured: true,
      profileCount: 1,
      profiles: [{ id: PROFILE.id, version: 1, enabled: true, emergencyDisabled: false }],
    })
    expect(relative.catalog.latest(PROFILE.id)).toBeDefined()
    expect(JSON.stringify(relative.profiles)).not.toContain('api.example.com')

    const absolute = loadEgressOperatorState({
      SYMBOLWRIGHT_EGRESS_POLICY_FILE: path.join(root, relativePath),
    })
    expect(absolute.state).toBe('allowlisted')
  })

  it('reports disabled-only profile files without enabling runtime egress', async () => {
    const root = await workspace()
    await fs.writeFile(
      path.join(root, 'profiles.json'),
      JSON.stringify([{ ...PROFILE, enabled: false }]),
      'utf8',
    )

    expect(
      loadEgressOperatorState({ SYMBOLWRIGHT_EGRESS_POLICY_FILE: 'profiles.json' }, root),
    ).toMatchObject({
      state: 'dependency-only',
      configured: false,
      profileCount: 1,
    })
  })

  it('fails closed for missing, malformed, non-array, and invalid profiles', async () => {
    const root = await workspace()
    expect(
      loadEgressOperatorState({ SYMBOLWRIGHT_EGRESS_POLICY_FILE: 'missing.json' }, root),
    ).toMatchObject({ state: 'denied', errorCode: 'EGRESS_POLICY_FILE_INVALID' })

    await fs.writeFile(path.join(root, 'malformed.json'), '{', 'utf8')
    expect(
      loadEgressOperatorState({ SYMBOLWRIGHT_EGRESS_POLICY_FILE: 'malformed.json' }, root),
    ).toMatchObject({ state: 'denied', errorCode: 'EGRESS_POLICY_FILE_INVALID' })

    await fs.writeFile(path.join(root, 'object.json'), JSON.stringify({ profile: PROFILE }), 'utf8')
    expect(
      loadEgressOperatorState({ SYMBOLWRIGHT_EGRESS_POLICY_FILE: 'object.json' }, root),
    ).toMatchObject({ state: 'denied', errorCode: 'EGRESS_POLICY_FILE_SCHEMA_INVALID' })

    await fs.writeFile(
      path.join(root, 'invalid.json'),
      JSON.stringify([{ ...PROFILE, allowedHosts: [] }]),
      'utf8',
    )
    expect(
      loadEgressOperatorState({ SYMBOLWRIGHT_EGRESS_POLICY_FILE: 'invalid.json' }, root),
    ).toMatchObject({ state: 'denied', errorCode: 'EGRESS_POLICY_PROFILE_INVALID' })
  })
})
