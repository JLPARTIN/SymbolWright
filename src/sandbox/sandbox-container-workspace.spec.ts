import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupSandboxContainerWorkspace,
  materializeSandboxContainerWorkspace,
  quarantineSandboxContainerArtifacts,
  SandboxWorkspaceBoundaryError,
} from './sandbox-container-workspace.js'
import { DEFAULT_SANDBOX_LIMITS } from './sandbox-limits.js'

const roots: string[] = []

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('strong sandbox workspace boundary', () => {
  it('materializes source outside the repository with container-writable copy semantics', async () => {
    const stateRoot = await temporaryRoot('symbolwright-state-')
    const workspace = await materializeSandboxContainerWorkspace({
      executionId: 'sandbox-source',
      request: {
        languageId: 'javascript',
        mode: 'run',
        source: 'console.log("isolated")',
      },
      limits: DEFAULT_SANDBOX_LIMITS,
      stateRoot,
    })

    expect(workspace.workRoot.startsWith(stateRoot)).toBe(true)
    expect(workspace.entrypoint).toBe('main.js')
    expect(await readFile(path.join(workspace.inputDir, 'main.js'), 'utf8')).toContain('isolated')
    expect(workspace.inputManifest.get('main.js')?.sha256).toMatch(/^[a-f0-9]{64}$/)

    await cleanupSandboxContainerWorkspace(workspace)
    await expect(readFile(path.join(workspace.inputDir, 'main.js'), 'utf8')).rejects.toThrow()
  })

  it('rejects repository symlinks instead of following them outside the managed root', async () => {
    const repository = await temporaryRoot('symbolwright-repository-')
    const outside = await temporaryRoot('symbolwright-outside-')
    const stateRoot = await temporaryRoot('symbolwright-state-')
    await writeFile(path.join(outside, 'secret.txt'), 'host-secret')
    await symlink(path.join(outside, 'secret.txt'), path.join(repository, 'escape.txt'))

    await expect(
      materializeSandboxContainerWorkspace({
        executionId: 'sandbox-symlink',
        request: {
          languageId: 'javascript',
          mode: 'run',
          repository: { rootPath: repository, selectedPaths: ['escape.txt'] },
        },
        limits: DEFAULT_SANDBOX_LIMITS,
        stateRoot,
      }),
    ).rejects.toThrow(SandboxWorkspaceBoundaryError)
  })

  it('quarantines only changed files and emits bounded manifest and patch artifacts', async () => {
    const stateRoot = await temporaryRoot('symbolwright-state-')
    const workspace = await materializeSandboxContainerWorkspace({
      executionId: 'sandbox-artifacts',
      request: {
        languageId: 'javascript',
        mode: 'run',
        files: [
          { path: 'main.js', content: 'console.log("before")\n' },
          { path: 'unchanged.txt', content: 'same\n' },
        ],
      },
      limits: DEFAULT_SANDBOX_LIMITS,
      stateRoot,
    })
    await mkdir(workspace.outputDir, { recursive: true })
    await writeFile(path.join(workspace.outputDir, 'main.js'), 'console.log("after")\n')
    await writeFile(path.join(workspace.outputDir, 'unchanged.txt'), 'same\n')
    await mkdir(path.join(workspace.outputDir, 'generated'), { recursive: true })
    await writeFile(path.join(workspace.outputDir, 'generated', 'report.json'), '{"ok":true}\n')

    const quarantine = await quarantineSandboxContainerArtifacts({
      executionId: 'sandbox-artifacts',
      workspace,
      limits: DEFAULT_SANDBOX_LIMITS,
    })

    expect(quarantine.changedPaths).toEqual(['generated/report.json', 'main.js'])
    expect(quarantine.removedPaths).toEqual([])
    expect(quarantine.artifacts.map((artifact) => artifact.name)).toEqual(
      expect.arrayContaining([
        'files/generated/report.json',
        'files/main.js',
        'changes.json',
        'changes.patch',
      ]),
    )
    expect(quarantine.artifacts.every((artifact) => artifact.sizeBytes > 0)).toBe(true)
    expect(quarantine.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256))).toBe(
      true,
    )
  })

  it('rejects generated symlinks before artifact export', async () => {
    const stateRoot = await temporaryRoot('symbolwright-state-')
    const workspace = await materializeSandboxContainerWorkspace({
      executionId: 'sandbox-output-symlink',
      request: {
        languageId: 'javascript',
        mode: 'run',
        source: 'console.log(1)',
      },
      limits: DEFAULT_SANDBOX_LIMITS,
      stateRoot,
    })
    await writeFile(path.join(workspace.outputDir, 'main.js'), 'console.log(1)')
    await symlink('/etc/passwd', path.join(workspace.outputDir, 'escape'))

    await expect(
      quarantineSandboxContainerArtifacts({
        executionId: 'sandbox-output-symlink',
        workspace,
        limits: DEFAULT_SANDBOX_LIMITS,
      }),
    ).rejects.toThrow('Generated symlink rejected')
  })
})
