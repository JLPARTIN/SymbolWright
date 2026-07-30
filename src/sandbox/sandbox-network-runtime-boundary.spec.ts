import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  SANDBOX_NETWORK_POLICY_FILE_ENV,
  clearApplicationSandboxNetworkRuntimesForTests,
  getOrCreateApplicationSandboxNetworkRuntime,
  sandboxNetworkReadinessDetail,
} from './sandbox-network-runtime.js'

const roots: string[] = []

afterEach(() => {
  clearApplicationSandboxNetworkRuntimesForTests()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('application sandbox network runtime policy boundaries', () => {
  it('rejects an empty workspace and treats a blank policy path as offline-only', () => {
    expect(() =>
      getOrCreateApplicationSandboxNetworkRuntime({ workspaceRoot: '   ', env: {} }),
    ).toThrow('workspaceRoot must not be empty.')

    const runtime = getOrCreateApplicationSandboxNetworkRuntime({
      workspaceRoot: createWorkspace(),
      env: { [SANDBOX_NETWORK_POLICY_FILE_ENV]: '   ' },
    })
    expect(runtime.status.mode).toBe('offline-only')
  })

  it('rejects symbolic-link, directory, and oversized policy files', () => {
    const symlinkRoot = createWorkspace()
    const target = writePolicy(symlinkRoot, validPolicyDocument(), 'target.json')
    const link = path.join(symlinkRoot, 'policy-link.json')
    symlinkSync(target, link)
    expect(() => configuredRuntime(symlinkRoot, link)).toThrow(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} must reference a regular file, not a symlink.`,
    )

    const directoryRoot = createWorkspace()
    const directory = path.join(directoryRoot, 'policy-directory')
    mkdirSync(directory)
    expect(() => configuredRuntime(directoryRoot, directory)).toThrow(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} must reference a regular file.`,
    )

    const oversizedRoot = createWorkspace()
    const oversized = path.join(oversizedRoot, 'oversized-policy.json')
    writeFileSync(oversized, Buffer.alloc(1024 * 1024 + 1), { mode: 0o600 })
    expect(() => configuredRuntime(oversizedRoot, oversized)).toThrow(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} exceeds the 1048576-byte limit.`,
    )
  })

  it.each(['null', '[]', '1', '"policy"'])('rejects a non-object policy document %s', (content) => {
    const root = createWorkspace()
    const policyFile = writePolicy(root, content)
    expect(() => configuredRuntime(root, policyFile)).toThrow(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} must contain a JSON object.`,
    )
  })

  it('rejects an unsupported document schema version', () => {
    const root = createWorkspace()
    const policyFile = writePolicy(root, JSON.stringify({ schemaVersion: 2 }))
    expect(() => configuredRuntime(root, policyFile)).toThrow(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} schemaVersion must be 1.`,
    )
  })

  it.each([
    ['dependencyProfiles', { dependencyProfiles: {} }],
    ['egressProfiles', { egressProfiles: {} }],
  ])('rejects a non-array %s field', (field, extra) => {
    const root = createWorkspace()
    const policyFile = writePolicy(root, JSON.stringify({ schemaVersion: 1, ...extra }))
    expect(() => configuredRuntime(root, policyFile)).toThrow(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} field ${field} must be an array.`,
    )
  })

  it.each([null, [], 'npm-public'])(
    'rejects a non-object default policy reference %j',
    (defaultDependencyPolicy) => {
      const root = createWorkspace()
      const policyFile = writePolicy(
        root,
        JSON.stringify({ schemaVersion: 1, defaultDependencyPolicy }),
      )
      expect(() => configuredRuntime(root, policyFile)).toThrow(
        `${SANDBOX_NETWORK_POLICY_FILE_ENV} field defaultDependencyPolicy must be an object.`,
      )
    },
  )

  it.each([
    { id: '', version: 1 },
    { id: 'npm-public', version: '1' },
    { id: 'npm-public', version: 1.5 },
    { id: 'npm-public', version: 0 },
  ])('rejects an invalid default policy reference %j', (defaultDependencyPolicy) => {
    const root = createWorkspace()
    const policyFile = writePolicy(
      root,
      JSON.stringify({ schemaVersion: 1, defaultDependencyPolicy }),
    )
    expect(() => configuredRuntime(root, policyFile)).toThrow(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} field defaultDependencyPolicy requires a non-empty id and positive integer version.`,
    )
  })

  it('rejects a default policy that is not an enabled installed profile', () => {
    const root = createWorkspace()
    const policyFile = writePolicy(
      root,
      JSON.stringify({
        schemaVersion: 1,
        dependencyProfiles: [],
        defaultDependencyPolicy: { id: 'missing', version: 1 },
      }),
    )
    expect(() => configuredRuntime(root, policyFile)).toThrow(
      `${SANDBOX_NETWORK_POLICY_FILE_ENV} defaultDependencyPolicy must reference an enabled installed dependency profile.`,
    )
  })

  it('resolves a relative policy path and reports configured mode without a default profile', () => {
    const root = createWorkspace()
    const policyFile = writePolicy(root, validPolicyDocument())
    const relativePolicyFile = path.relative(process.cwd(), policyFile)
    const runtime = getOrCreateApplicationSandboxNetworkRuntime({
      workspaceRoot: root,
      env: { [SANDBOX_NETWORK_POLICY_FILE_ENV]: relativePolicyFile },
    })

    expect(runtime.status).toEqual({
      mode: 'configured',
      stateRoot: path.join(root, '.symbolwright', 'sandbox-network'),
      policyFile,
      dependencyProfileCount: 0,
      egressProfileCount: 0,
    })
    expect(sandboxNetworkReadinessDetail(runtime.status)).toBe(
      'configured; dependencyProfiles=0; defaultDependencyPolicy=none; egressProfiles=0',
    )
  })
})

function configuredRuntime(workspaceRoot: string, policyFile: string) {
  return getOrCreateApplicationSandboxNetworkRuntime({
    workspaceRoot,
    env: { [SANDBOX_NETWORK_POLICY_FILE_ENV]: policyFile },
  })
}

function createWorkspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'symbolwright-network-boundary-'))
  roots.push(root)
  return root
}

function writePolicy(root: string, content: string, name = 'sandbox-network-policy.json'): string {
  const policyFile = path.join(root, name)
  writeFileSync(policyFile, content, { mode: 0o600 })
  return policyFile
}

function validPolicyDocument(): string {
  return JSON.stringify({
    schemaVersion: 1,
    dependencyProfiles: [],
    egressProfiles: [],
  })
}
