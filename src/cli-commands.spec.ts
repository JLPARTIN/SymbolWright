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

  it('lists agent, sessions, and index commands', () => {
    const output = renderHelp()

    expect(output).toContain('agent [message]')
    expect(output).toContain('direct execution coding agent')
    expect(output).toContain('sessions')
    expect(output).toContain('List saved agent sessions')
    expect(output).toContain('index [dir]')
    expect(output).toContain('vector store for semantic search')
  })

  it('lists build-ledger command', () => {
    const output = renderHelp()

    expect(output).toContain('build-ledger')
    expect(output).toContain('build ledger summary')
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
    expect(output).toContain('Run a bounded runtime loop')
  })

  it('does not expose the obsolete approval-ticket runtime path', () => {
    const output = renderHelp()

    expect(output).not.toContain('runtime run <goal> --approval-ticket <id>')
    expect(output).not.toContain('Render runtime execution with audit output')
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
    expect(output).toContain(
      'Run live read client fixture through fake client and evidence pipeline',
    )
  })

  it('marks Phase H GitHub live read adapter command as active', () => {
    const output = renderHelp()

    expect(output).toContain('github-live-read <json-file>')
    expect(output).toContain(
      'Read GitHub PR or CI evidence through the runtime policy live read adapter',
    )
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
    expect(output).toContain(
      'Create a write intent plan with validation evidence from a local JSON fixture',
    )
  })

  it('marks Phase L local file write gate command as active', () => {
    const output = renderHelp()

    expect(output).toContain('local-write <json-file>')
    expect(output).toContain(
      'Execute a local file write through the runtime policy gate from a local JSON fixture',
    )
  })

  it('marks Phase M validation command gate command as active', () => {
    const output = renderHelp()

    expect(output).toContain('validation-command <json-file>')
    expect(output).toContain(
      'Evaluate a validation command through the allowlisted runtime policy gate from a local JSON fixture',
    )
  })

  it('marks Phase N PR preparation command as active', () => {
    const output = renderHelp()

    expect(output).toContain('pr-preparation <json-file>')
    expect(output).toContain(
      'Prepare a PR title, body, and validation checklist from a local JSON fixture without pushing or creating a PR',
    )
  })

  it('marks Phase O GitHub write proposal command as active', () => {
    const output = renderHelp()

    expect(output).toContain('github-write-proposal <json-file>')
    expect(output).toContain(
      'Create a GitHub write proposal from a local JSON fixture without executing any GitHub API call',
    )
  })

  it('marks Phase P GitHub write gate command as active', () => {
    const output = renderHelp()

    expect(output).toContain('github-write-gate <json-file>')
    expect(output).toContain(
      'Evaluate a GitHub write through the runtime policy gate from a local JSON fixture',
    )
  })

  it('marks Phase Q workflow composition command as active', () => {
    const output = renderHelp()

    expect(output).toContain('workflow <json-file>')
    expect(output).toContain(
      'Run a runtime workflow composing registered tools from a local JSON fixture',
    )
  })

  it('marks Phase R Ajna workflow command as active', () => {
    const output = renderHelp()

    expect(output).toContain('ajna-workflow <json-file>')
    expect(output).toContain(
      'Run a read-only Ajna review or merge-readiness workflow from a local JSON fixture',
    )
  })

  it('marks Phase S runtime status dashboard command as active', () => {
    const output = renderHelp()

    expect(output).toContain('runtime-status')
    expect(output).toContain(
      'Show the runtime status dashboard with tool inventory, policy, and phase summary',
    )
  })

  it('marks project-context command as active', () => {
    const output = renderHelp()

    expect(output).toContain('project-context [dir]')
    expect(output).toContain('Build a deterministic project context packet')
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
    expect(output).toContain(
      'collector snapshot JSON from a local GitHub-shaped API payload fixture',
    )
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
    expect(renderStatus()).toContain('Codetelligence')
  })

  it('shows the capability label', () => {
    expect(renderStatus()).toContain('Capability:')
  })
})

describe('renderNotYetActive', () => {
  it('renders reserved command message', () => {
    const output = renderNotYetActive('runtime push')
    expect(output).toContain('Command not active yet: runtime push')
    expect(output).toContain('reserved for a later CodeMind runtime phase')
  })
})
