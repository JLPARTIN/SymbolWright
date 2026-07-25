import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { assessRuntimeModeTruth } from './runtime-mode-truth-gate.js'

const WORKSPACE = path.resolve(import.meta.dirname, '..', '..')

function writeFile(root: string, filePath: string, content: string): void {
  const absolutePath = path.join(root, filePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, content)
}

describe('assessRuntimeModeTruth', () => {
  it('passes for the current repository source of truth', () => {
    const report = assessRuntimeModeTruth(WORKSPACE)

    expect(report.status).toBe('PASS')
    expect(report.findings).toEqual([])
  })

  it('fails when docs drift back to approval-first wording', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-runtime-drift-'))

    writeFile(
      root,
      'README.md',
      [
        'PLAN_ONLY READ_ONLY PROPOSAL_ONLY APPROVED_EXECUTION',
        'direct-capable coding-agent platform',
        'APPROVED_EXECUTION is the direct execution mode',
        'SYMBOLWRIGHT_RUNTIME_MODE=APPROVED_EXECUTION',
        'Governance is optional by mode',
        'read-only and plan-first by default',
      ].join('\n'),
    )
    writeFile(
      root,
      path.join('docs', 'governance', 'SYMBOLWRIGHT_PERMISSION_MODEL.md'),
      [
        'PLAN_ONLY READ_ONLY PROPOSAL_ONLY APPROVED_EXECUTION',
        'Governance is a feature, not the default personality',
        '`APPROVED_EXECUTION` is the direct execution mode',
        'direct-capable by runtime mode',
      ].join('\n'),
    )
    writeFile(
      root,
      path.join('docs', 'governance', 'SYMBOLWRIGHT_THREAT_MODEL.md'),
      [
        'PLAN_ONLY READ_ONLY PROPOSAL_ONLY APPROVED_EXECUTION',
        'This document does not make SymbolWright read-only by default',
        '`APPROVED_EXECUTION` is direct-capable',
        'SymbolWright may execute directly in `APPROVED_EXECUTION`',
      ].join('\n'),
    )

    const report = assessRuntimeModeTruth(root)

    expect(report.status).toBe('FAIL')
    expect(report.findings).toContain(
      'README.md contains stale runtime posture phrase: read-only and plan-first by default',
    )
  })

  it('fails when required runtime truth docs are missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-runtime-missing-'))
    const report = assessRuntimeModeTruth(root)

    expect(report.status).toBe('FAIL')
    expect(report.findings).toContain('README.md missing')
    expect(report.findings).toContain('docs/governance/SYMBOLWRIGHT_PERMISSION_MODEL.md missing')
    expect(report.findings).toContain('docs/governance/SYMBOLWRIGHT_THREAT_MODEL.md missing')
  })
})
