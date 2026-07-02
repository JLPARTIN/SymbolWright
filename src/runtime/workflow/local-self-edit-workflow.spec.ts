import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createFixtureRegistry } from '../registry/fixture-registry-factory.js'
import type { SandboxFileWriter, SandboxRunner } from '../sandbox/sandbox-runner.js'
import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { renderLocalSelfEditResult, runLocalSelfEditWorkflow } from './local-self-edit-workflow.js'

const policy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowReadOnlyNetwork: true,
  allowShell: true,
  allowWrites: true,
  allowGitHubWrites: false,
  protectedPaths: ['node_modules', 'dist', 'coverage'],
  noisyDirs: [],
}

const approval: RuntimeApproval = {
  ticketId: 'SELF-EDIT-W-001',
  approvedBy: 'operator',
  scopes: ['file:write', 'command:validate'],
}

const hostBackedSandboxWriter: SandboxFileWriter = {
  writeFile: (request) => {
    const target = path.resolve(request.workspaceRoot, request.targetPath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, request.content, 'utf8')
    return {
      outcome: 'WRITTEN',
      runner: 'docker',
      targetPath: request.targetPath,
      stdout: '',
      stderr: '',
      exitCode: 0,
      reason: null,
    }
  },
}

const successfulSandboxRunner: SandboxRunner = {
  runCommand: async (request) => ({
    outcome: 'EXECUTED',
    runner: 'docker',
    command: [request.binary, ...request.args].join(' '),
    stdout: '7\n',
    stderr: '',
    exitCode: 0,
    reason: null,
  }),
}

function makeWorkspace(): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-self-edit-'))
  fs.writeFileSync(
    path.join(workspace, 'package.json'),
    JSON.stringify({ scripts: { typecheck: 'node -e "console.log(7)"' } }),
    'utf8',
  )
  return workspace
}

describe('local self-edit workflow', () => {
  it('registers required local self-edit tools', () => {
    const registry = createFixtureRegistry('local_self_edit')

    expect(registry.has('apply_patch')).toBe(true)
    expect(registry.has('validation_command_gate')).toBe(true)
  })

  it('previews a patch without writing files', async () => {
    const workspace = makeWorkspace()
    const result = await runLocalSelfEditWorkflow(
      {
        name: 'Preview change',
        mode: 'preview-only',
        reason: 'Preview generated file',
        rollbackNote: 'No rollback needed',
        files: [{ targetPath: 'src/generated.ts', content: 'export const generated = true\n' }],
        policy,
        approval,
        sandboxFileWriter: hostBackedSandboxWriter,
      },
      workspace,
    )

    expect(result.workflow.status).toBe('completed')
    expect(result.workflow.stepsExecuted).toBe(1)
    expect(fs.existsSync(path.join(workspace, 'src/generated.ts'))).toBe(false)
  })

  it('applies a patch and runs validation when approved', async () => {
    const workspace = makeWorkspace()
    const result = await runLocalSelfEditWorkflow(
      {
        name: 'Apply and validate',
        mode: 'apply-and-validate',
        reason: 'Create generated file',
        rollbackNote: 'Delete generated file',
        files: [{ targetPath: 'src/generated.ts', content: 'export const generated = true\n' }],
        validationCommand: 'npm run typecheck',
        policy,
        approval,
        sandboxRunner: successfulSandboxRunner,
        sandboxFileWriter: hostBackedSandboxWriter,
      },
      workspace,
    )

    expect(result.workflow.status).toBe('completed')
    expect(result.workflow.stepsExecuted).toBe(2)
    expect(fs.readFileSync(path.join(workspace, 'src/generated.ts'), 'utf8')).toBe(
      'export const generated = true\n',
    )
    expect(result.workflow.stepResults[1]?.output).toContain('Outcome: EXECUTED')
  })

  it('renders workflow output', async () => {
    const workspace = makeWorkspace()
    const result = await runLocalSelfEditWorkflow(
      {
        name: 'Preview change',
        mode: 'preview-only',
        reason: 'Preview generated file',
        rollbackNote: 'No rollback needed',
        files: [{ targetPath: 'src/generated.ts', content: 'export const generated = true\n' }],
        policy,
        approval,
        sandboxFileWriter: hostBackedSandboxWriter,
      },
      workspace,
    )

    const output = renderLocalSelfEditResult(result)

    expect(output).toContain('CodeMind local self-edit workflow')
    expect(output).toContain('Mode: preview-only')
    expect(output).toContain('CodeMind runtime workflow result')
  })
})
