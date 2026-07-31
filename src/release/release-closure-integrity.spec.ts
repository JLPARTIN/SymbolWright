import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  FINAL_SANDBOX_AUDIT_RELATIVE_PATH,
  assessReleaseClosureIntegrity,
} from './release-closure-integrity.js'

const workspaces: string[] = []

function createWorkspace(): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-release-closure-'))
  workspaces.push(workspace)

  const auditPath = path.join(workspace, FINAL_SANDBOX_AUDIT_RELATIVE_PATH)
  fs.mkdirSync(path.dirname(auditPath), { recursive: true })
  fs.writeFileSync(
    auditPath,
    [
      '# Final Sandbox Adversarial Audit',
      '',
      '**Audited code SHA:** `0123456789abcdef0123456789abcdef01234567`',
      '',
      '**Release verdict:** **PASS**',
      '',
    ].join('\n'),
  )

  const workflowDirectory = path.join(workspace, '.github', 'workflows')
  fs.mkdirSync(workflowDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(workflowDirectory, 'ci.yml'),
    [
      'name: CI',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  test:',
      '    steps:',
      '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      '',
    ].join('\n'),
  )

  return workspace
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})

describe('assessReleaseClosureIntegrity', () => {
  it('passes a clean exact-revision-bound release candidate', () => {
    const report = assessReleaseClosureIntegrity(createWorkspace())

    expect(report).toEqual({ status: 'PASS', findings: [] })
  })

  it('fails when the final adversarial audit is missing', () => {
    const workspace = createWorkspace()
    fs.rmSync(path.join(workspace, FINAL_SANDBOX_AUDIT_RELATIVE_PATH))

    const report = assessReleaseClosureIntegrity(workspace)

    expect(report.status).toBe('FAIL')
    expect(report.findings).toContain(
      `Final sandbox adversarial audit is missing: ${FINAL_SANDBOX_AUDIT_RELATIVE_PATH}`,
    )
  })

  it('fails when the final audit verdict is not PASS', () => {
    const workspace = createWorkspace()
    const auditPath = path.join(workspace, FINAL_SANDBOX_AUDIT_RELATIVE_PATH)
    const content = fs
      .readFileSync(auditPath, 'utf8')
      .replace('**Release verdict:** **PASS**', '**Release verdict:** **BLOCKED**')
    fs.writeFileSync(auditPath, content)

    const report = assessReleaseClosureIntegrity(workspace)

    expect(report.status).toBe('FAIL')
    expect(report.findings).toContain(
      'Final sandbox adversarial audit release verdict is BLOCKED, not PASS',
    )
  })

  it('fails when temporary PR audit residue remains', () => {
    const workspace = createWorkspace()
    const marker = path.join(workspace, 'docs', 'security', 'PR7_DO_NOT_MERGE.md')
    fs.writeFileSync(marker, '# DO NOT MERGE\n')

    const report = assessReleaseClosureIntegrity(workspace)

    expect(report.status).toBe('FAIL')
    expect(report.findings).toContain(
      `Temporary release artifact remains: ${path.join('docs', 'security', 'PR7_DO_NOT_MERGE.md')}`,
    )
  })

  it('catches a future bundle-numbered marker, not only pr7-, without hardcoding a bundle number', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(path.join(workspace, '.github', 'pr42-live-egress-trigger'), 'run\n')
    fs.writeFileSync(
      path.join(workspace, '.github', 'workflows', 'pr42-implementation.yml'),
      ['name: PR42 implementation', 'jobs:', '  build:', '    steps: []', ''].join('\n'),
    )

    const report = assessReleaseClosureIntegrity(workspace)

    expect(report.status).toBe('FAIL')
    expect(report.findings).toContain(
      `Temporary release artifact remains: ${path.join('.github', 'pr42-live-egress-trigger')}`,
    )
    expect(report.findings).toContain(
      `Temporary release artifact remains: ${path.join('.github', 'workflows', 'pr42-implementation.yml')}`,
    )
  })

  it.each([
    ['a trigger marker', 'egress-trigger.yml'],
    ['a workplan note', 'SANDBOX_WORKPLAN.md'],
    ['a not-for-merge note', 'NOT_FOR_MERGE.md'],
    ['a findings ledger', 'AUDIT_FINDINGS_LEDGER.md'],
    ['an auto-commit marker', 'AUTO_COMMIT_NOTES.md'],
  ])('catches %s by keyword, independent of any bundle number', (_label, filename) => {
    const workspace = createWorkspace()
    fs.writeFileSync(path.join(workspace, 'docs', 'security', filename), 'temporary\n')

    const report = assessReleaseClosureIntegrity(workspace)

    expect(report.status).toBe('FAIL')
    expect(report.findings).toContain(
      `Temporary release artifact remains: ${path.join('docs', 'security', filename)}`,
    )
  })

  it('does not flag a legitimate product doc that happens to contain an unrelated word', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, 'docs', 'security', 'SANDBOX_NETWORK_GATEWAY_COMPOSITION.md'),
      '# Sandbox Network Gateway Composition\n',
    )

    const report = assessReleaseClosureIntegrity(workspace)

    expect(report).toEqual({ status: 'PASS', findings: [] })
  })

  it('fails moving action tags and contents-write workflows', () => {
    const workspace = createWorkspace()
    fs.writeFileSync(
      path.join(workspace, '.github', 'workflows', 'unsafe.yml'),
      [
        'name: Unsafe',
        'permissions:',
        '  contents: write',
        'jobs:',
        '  mutate:',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '',
      ].join('\n'),
    )

    const report = assessReleaseClosureIntegrity(workspace)

    expect(report.status).toBe('FAIL')
    expect(report.findings).toContain(
      `Unexpected contents: write workflow permission: ${path.join(
        '.github',
        'workflows',
        'unsafe.yml',
      )}`,
    )
    expect(report.findings).toContain(
      `Workflow action is not commit-SHA pinned: ${path.join(
        '.github',
        'workflows',
        'unsafe.yml',
      )} -> actions/checkout@v4`,
    )
  })
})
