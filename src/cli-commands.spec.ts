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

  it('marks Phase A read-only runtime commands as active', () => {
    const output = renderHelp()

    expect(output).toContain('plan <goal>')
    expect(output).toContain('Render a runtime-backed non-mutating work plan')
    expect(output).toContain('read <path>')
    expect(output).toContain('Read an allowed workspace file without mutation')
    expect(output).toContain('search <query>')
    expect(output).toContain('Search allowed workspace files without mutation')
    expect(output).toContain('validation-plan [focus]')
    expect(output).toContain('Render validation guidance without executing commands')
    expect(output).not.toContain('Read approved file content [future]')
    expect(output).not.toContain('Search repository text [future]')
    expect(output).not.toContain('Propose validation commands [future]')
  })

  it('marks Phase B proposal mode commands as active', () => {
    const output = renderHelp()

    expect(output).toContain('propose-patch <goal>')
    expect(output).toContain('Draft a patch proposal without applying it')
    expect(output).toContain('ci-review [source]')
    expect(output).toContain('Draft a local CI review without querying services')
    expect(output).toContain('pr-notes [focus]')
    expect(output).toContain('Draft PR notes without posting them')
    expect(output).not.toContain('Draft a patch plan without applying it [future]')
    expect(output).not.toContain('CI failures from available logs/context [future]')
    expect(output).not.toContain('Draft PR summary or review notes [future]')
  })

  it('marks Phase C read-only runtime loop command as active', () => {
    const output = renderHelp()

    expect(output).toContain('runtime run <goal> --read-only')
    expect(output).toContain('Run a bounded read-only runtime loop')
  })

  it('marks Phase D approved runtime command as active', () => {
    const output = renderHelp()

    expect(output).toContain('runtime run <goal> --approval-ticket <id>')
    expect(output).toContain('Render approval-gated dry-run execution with audit output')
  })

  it('marks Phase E local fixture read adapter commands as active', () => {
    const output = renderHelp()

    expect(output).toContain('ci-review --fixture-file <json-file>')
    expect(output).toContain('Draft CI review from local workflow fixture evidence')
    expect(output).toContain('pr-notes --fixture-file <json-file>')
    expect(output).toContain('Draft PR notes from local PR fixture evidence')
  })

  it('marks Phase F live read policy handshake command as active', () => {
    const output = renderHelp()

    expect(output).toContain('live-read-policy <json-file>')
    expect(output).toContain('Evaluate live read policy handshake from a local JSON fixture')
  })

  it('marks Phase G live read client fixture command as active', () => {
    const output = renderHelp()

    expect(output).toContain('live-read-client-fixture <json-file>')
    expect(output).toContain('Run live read client fixture through fake client and evidence pipeline')
  })

  it('marks Phase H GitHub live read adapter command as active', () => {
    const output = renderHelp()

    expect(output).toContain('github-live-read <json-file>')
    expect(output).toContain('Read GitHub PR or CI evidence through policy-gated live read adapter')
  })

  it('marks Phase I Ajna live-read pipeline command as active', () => {
    const output = renderHelp()

    expect(output).toContain('ajna-live-read <json-file>')
    expect(output).toContain('Run Ajna review or merge-readiness pipeline from live-read evidence')
  })

  it('marks Phase J operator review gate command as active', () => {
    const output = renderHelp()

    expect(output).toContain('operator-review <json-file>')
    expect(output).toContain('Create an operator review packet from a local JSON fixture')
  })

  it('marks Phase K write intent plan command as active', () => {
    const output = renderHelp()

    expect(output).toContain('write-intent <json-file>')
    expect(output).toContain('Create a write intent plan with validation and approval ticket from a local JSON fixture')
  })

  it('marks Phase L local file write gate command as active', () => {
    const output = renderHelp()

    expect(output).toContain('local-write <json-file>')
    expect(output).toContain('Evaluate a controlled local file write through the approval-gated write gate from a local JSON fixture')
  })

  it('marks Phase M validation command gate command as active', () => {
    const output = renderHelp()

    expect(output).toContain('validation-command <json-file>')
    expect(output).toContain('Evaluate an approved validation command through the allowlisted command gate from a local JSON fixture')
  })

  it('marks Phase N PR preparation command as active', () => {
    const output = renderHelp()

    expect(output).toContain('pr-preparation <json-file>')
    expect(output).toContain('Prepare a PR title, body, and validation checklist from a local JSON fixture without pushing or creating a PR')
  })

  it('marks Phase O GitHub write proposal command as active', () => {
    const output = renderHelp()

    expect(output).toContain('github-write-proposal <json-file>')
    expect(output).toContain('Create a governed GitHub write proposal from a local JSON fixture without executing any GitHub API call')
  })

  it('marks Phase P GitHub write gate command as active', () => {
    const output = renderHelp()

    expect(output).toContain('github-write-gate <json-file>')
    expect(output).toContain('Evaluate an approved GitHub write through the policy-gated write gate from a local JSON fixture')
  })

  it('includes ajna subcommands', () => {
    const output = renderHelp()
    expect(output).toContain('ajna scan-profile')
    expect(output).toContain('ajna docs')
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
    expect(output).toContain('local Ajna documentation reference')
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

  it('shows post-Phase P runtime build state', () => {
    const output = renderStatus()

    expect(output).toContain('Runtime phases:     16 complete')
    expect(output).toContain('Next runtime phase: Phase Q')
  })

  it('shows all controlled capabilities as DISABLED', () => {
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
    expect(renderNotYetActive('runtime apply my-goal')).toContain('not yet active')
  })

  it('directs the user to help', () => {
    expect(renderNotYetActive('ajna review-pr 42')).toContain('codemind help')
  })
})
