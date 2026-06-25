import { describe, expect, it } from 'vitest'
import {
  CODEMIND_CLI_COMMANDS,
  renderHelp,
  renderNotYetActive,
  renderStatus,
} from './cli-commands.js'

describe('renderHelp', () => {
  it('includes the usage line', () => {
    expect(renderHelp()).toContain('Usage: codemind <command>')
  })

  it('lists every registered command', () => {
    const output = renderHelp()
    for (const { name } of CODEMIND_CLI_COMMANDS) {
      expect(output).toContain(name)
    }
  })

  it('includes ajna subcommands', () => {
    const output = renderHelp()
    expect(output).toContain('ajna scan-profile')
    expect(output).toContain('ajna client-pipeline-manifest')
    expect(output).toContain('ajna client-pipeline-status')
    expect(output).toContain('ajna review-pr')
    expect(output).toContain('ajna review-pr-github-fixture')
    expect(output).toContain('ajna review-pr-github-api-fixture')
    expect(output).toContain('ajna github-api-snapshot-fixture')
    expect(output).toContain('ajna client-collector-fixture')
    expect(output).toContain('ajna review-pr-client-collector-fixture')
    expect(output).toContain('ajna merge-readiness-client-collector-fixture')
    expect(output).toContain('ajna review-pr-collector-fixture')
    expect(output).toContain('ajna review-pr-readonly-collector-fixture')
    expect(output).toContain('ajna github-readonly-collector-fixture')
    expect(output).toContain('ajna merge-readiness')
    expect(output).toContain('PR review report from evidence JSON')
    expect(output).toContain('local Ajna client collector fixture pipeline manifest')
    expect(output).toContain('local Ajna client collector fixture pipeline status')
    expect(output).toContain('mocked local GitHub PR payload fixture')
    expect(output).toContain('local GitHub-shaped API payload fixture')
    expect(output).toContain('collector snapshot JSON from a local GitHub-shaped API payload fixture')
    expect(output).toContain('collector snapshot JSON from a local fake client bridge fixture')
    expect(output).toContain('Ajna review-pr from a local fake client bridge fixture')
    expect(output).toContain('merge-readiness from a local fake client bridge fixture')
    expect(output).toContain('local collector snapshot fixture')
    expect(output).toContain('local read-only collector request fixture')
    expect(output).toContain('read-only collector snapshot fixture as JSON')
    expect(output).toContain('read-only Ajna evidence JSON')
  })
})

describe('renderStatus', () => {
  it('shows the platform name', () => {
    expect(renderStatus()).toContain('CodeMind')
  })

  it('shows the primary capability', () => {
    expect(renderStatus()).toContain('Ajna Review Cortex')
  })

  it('shows PLAN_FIRST posture', () => {
    expect(renderStatus()).toContain('PLAN_FIRST')
  })

  it('shows all capabilities as DISABLED', () => {
    const output = renderStatus()
    expect(output).not.toContain('ENABLED')
    const disabledCount = (output.match(/DISABLED/g) ?? []).length
    expect(disabledCount).toBe(4)
  })
})

describe('renderNotYetActive', () => {
  it('includes the command name', () => {
    expect(renderNotYetActive('scan')).toContain('scan')
  })

  it('indicates not yet active', () => {
    expect(renderNotYetActive('plan my-goal')).toContain('not yet active')
  })

  it('directs the user to help', () => {
    expect(renderNotYetActive('ajna review-pr 42')).toContain('codemind help')
  })
})
