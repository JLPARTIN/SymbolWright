import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { runLocalSelfEditWorkflow, renderLocalSelfEditResult } from './local-self-edit-workflow.js'
import { createLocalSelfEditRuntimeRegistry } from '../runtime-local-self-edit-registry.js'

const policy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
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
    const registry = createLocalSelfEditRuntimeRegistry({})

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
      },
      workspace,
    )

    const output = renderLocalSelfEditResult(result)

    expect(output).toContain('CodeMind local self-edit workflow')
    expect(output).toContain('Mode: preview-only')
    expect(output).toContain('CodeMind runtime workflow result')
  })
})
