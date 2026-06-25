import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { RuntimeApproval, RuntimePolicySnapshot } from '../types.js'
import type { LocalFileWriteRequest } from './local-file-write-gate.js'
import {
  createLocalFileWriteDiff,
  executeApprovedLocalFileWrite,
  renderLocalFileWriteExecutionResult,
} from './local-file-writer.js'

const writePolicy: RuntimePolicySnapshot = {
  mode: 'APPROVED_EXECUTION',
  allowNetwork: false,
  allowShell: false,
  allowWrites: true,
  allowGitHubWrites: false,
  protectedPaths: ['.env', 'node_modules', 'dist', 'coverage'],
  noisyDirs: [],
}

const readOnlyPolicy: RuntimePolicySnapshot = {
  mode: 'READ_ONLY',
  allowNetwork: false,
  allowShell: false,
  allowWrites: false,
  allowGitHubWrites: false,
  protectedPaths: ['.env', 'node_modules', 'dist', 'coverage'],
  noisyDirs: [],
}

const approval: RuntimeApproval = {
  ticketId: 'WRITE-T-001',
  approvedBy: 'operator',
  scopes: ['file:write'],
}

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-local-write-'))
}

function makeRequest(overrides: Partial<LocalFileWriteRequest> = {}): LocalFileWriteRequest {
  return {
    targetPath: overrides.targetPath ?? 'src/generated.ts',
    content: overrides.content ?? 'export const generated = true\n',
    reason: overrides.reason ?? 'Generate a safe fixture file',
    rollbackNote: overrides.rollbackNote ?? 'Delete generated fixture file',
    dryRun: overrides.dryRun ?? true,
  }
}

describe('executeApprovedLocalFileWrite', () => {
  it('blocks without modifying files when writes are disabled', () => {
    const workspace = makeWorkspace()
    const request = makeRequest({ dryRun: false })

    const result = executeApprovedLocalFileWrite(request, workspace, readOnlyPolicy, approval)

    expect(result.status).toBe('blocked')
    expect(result.bytesWritten).toBe(0)
    expect(fs.existsSync(path.join(workspace, 'src/generated.ts'))).toBe(false)
  })

  it('blocks without modifying files when approval is missing', () => {
    const workspace = makeWorkspace()
    const request = makeRequest({ dryRun: false })

    const result = executeApprovedLocalFileWrite(request, workspace, writePolicy, undefined)

    expect(result.status).toBe('blocked')
    expect(fs.existsSync(path.join(workspace, 'src/generated.ts'))).toBe(false)
  })

  it('dry-runs without creating the target file', () => {
    const workspace = makeWorkspace()
    const request = makeRequest({ dryRun: true })

    const result = executeApprovedLocalFileWrite(request, workspace, writePolicy, approval)

    expect(result.status).toBe('dry_run')
    expect(result.bytesWritten).toBe(0)
    expect(fs.existsSync(path.join(workspace, 'src/generated.ts'))).toBe(false)
  })

  it('writes a new file when policy and approval allow execution', () => {
    const workspace = makeWorkspace()
    const request = makeRequest({ dryRun: false, content: 'export const ok = true\n' })

    const result = executeApprovedLocalFileWrite(request, workspace, writePolicy, approval)

    expect(result.status).toBe('applied')
    expect(result.existedBefore).toBe(false)
    expect(result.bytesWritten).toBe(Buffer.byteLength(request.content, 'utf8'))
    expect(fs.readFileSync(path.join(workspace, 'src/generated.ts'), 'utf8')).toBe('export const ok = true\n')
  })

  it('updates an existing file and captures previous content', () => {
    const workspace = makeWorkspace()
    const target = path.join(workspace, 'src/generated.ts')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'export const oldValue = true\n', 'utf8')

    const request = makeRequest({ dryRun: false, content: 'export const newValue = true\n' })
    const result = executeApprovedLocalFileWrite(request, workspace, writePolicy, approval)

    expect(result.status).toBe('applied')
    expect(result.existedBefore).toBe(true)
    expect(result.previousContent).toBe('export const oldValue = true\n')
    expect(fs.readFileSync(target, 'utf8')).toBe('export const newValue = true\n')
  })

  it('renders execution result with diff preview and rollback note', () => {
    const workspace = makeWorkspace()
    const request = makeRequest({ dryRun: true, rollbackNote: 'Remove generated file' })
    const result = executeApprovedLocalFileWrite(request, workspace, writePolicy, approval)
    const output = renderLocalFileWriteExecutionResult(result)

    expect(output).toContain('CodeMind local file write execution')
    expect(output).toContain('Status: DRY_RUN')
    expect(output).toContain('Rollback: Remove generated file')
    expect(output).toContain('Diff preview:')
    expect(output).toContain('Dry-run only. No file has been modified.')
  })

  it('creates a simple before and after diff', () => {
    const diff = createLocalFileWriteDiff('old\nvalue', 'new\nvalue')

    expect(diff.map((line) => `${line.marker}${line.text}`)).toEqual([
      '-old',
      '-value',
      '+new',
      '+value',
    ])
  })
})
