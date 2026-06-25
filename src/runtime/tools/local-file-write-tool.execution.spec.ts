import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import { localFileWriteTool } from './local-file-write-tool.js'

const writePolicy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowShell: false,
  allowWrites: true,
  allowGitHubWrites: false,
  protectedPaths: ['.env', 'node_modules', 'dist', 'coverage'],
  noisyDirs: [],
}

const approval: RuntimeApproval = {
  ticketId: 'WRITE-T-002',
  approvedBy: 'operator',
  scopes: ['file:write'],
}

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-write-tool-'))
}

describe('localFileWriteTool approved execution', () => {
  it('writes through the runtime tool only when approved and non-dry-run', async () => {
    const workspace = makeWorkspace()

    const output = await localFileWriteTool.execute(
      {
        targetPath: 'src/tool-generated.ts',
        content: 'export const fromTool = true\n',
        reason: 'Generate from tool',
        rollbackNote: 'Delete generated tool file',
        dryRun: false,
      },
      {
        cwd: workspace,
        policy: writePolicy,
        approval,
      },
    )

    expect(output).toContain('Status: APPLIED')
    expect(output).toContain('Approved local file write applied.')
    expect(output).toContain('Runtime audit log')
    expect(fs.readFileSync(path.join(workspace, 'src/tool-generated.ts'), 'utf8')).toBe(
      'export const fromTool = true\n',
    )
  })

  it('does not write through the runtime tool in dry-run mode', async () => {
    const workspace = makeWorkspace()

    const output = await localFileWriteTool.execute(
      {
        targetPath: 'src/tool-generated.ts',
        content: 'export const fromTool = true\n',
        reason: 'Generate from tool',
        rollbackNote: 'Delete generated tool file',
        dryRun: true,
      },
      {
        cwd: workspace,
        policy: writePolicy,
        approval,
      },
    )

    expect(output).toContain('Status: DRY_RUN')
    expect(fs.existsSync(path.join(workspace, 'src/tool-generated.ts'))).toBe(false)
  })
})
