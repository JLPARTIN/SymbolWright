#!/usr/bin/env node
import { renderAjnaClientCollectorFixtureForFile } from './cli-ajna-client-collector-fixture.js'
import { renderAjnaClientPipelineCheck } from './cli-ajna-client-pipeline-check.js'
import { renderAjnaClientPipelineManifest } from './cli-ajna-client-pipeline-manifest.js'
import { renderAjnaDocsReference } from './cli-ajna-docs.js'
import { renderAjnaGithubApiSnapshotFixtureForFile } from './cli-ajna-github-api-snapshot-fixture.js'
import { renderAjnaGithubReadOnlyCollectorFixtureForFile } from './cli-ajna-github-readonly-collector-fixture.js'
import { renderAjnaMergeReadinessClientCollectorFixtureForFile } from './cli-ajna-merge-readiness-client-collector-fixture.js'
import { renderAjnaMergeReadinessForFile } from './cli-ajna-merge-readiness.js'
import { renderAjnaReviewPrClientCollectorFixtureForFile } from './cli-ajna-review-pr-client-collector-fixture.js'
import { renderAjnaReviewPrCollectorFixtureForFile } from './cli-ajna-review-pr-collector-fixture.js'
import { renderAjnaReviewPrGithubApiFixtureForFile } from './cli-ajna-review-pr-github-api-fixture.js'
import { renderAjnaReviewPrGithubFixtureForFile } from './cli-ajna-review-pr-github-fixture.js'
import { renderAjnaReviewPrReadOnlyCollectorFixtureForFile } from './cli-ajna-review-pr-readonly-collector-fixture.js'
import { renderAjnaReviewPrForFile } from './cli-ajna-review-pr.js'
import { renderAjnaScanProfileForRepo } from './cli-ajna-scan-profile.js'
import { renderAuditLedgerCommand } from './cli-audit-ledger.js'
import { renderBuildLedgerCommand } from './cli-build-ledger.js'
import { renderHelp, renderNotYetActive, renderStatus } from './cli-commands.js'
import { renderDoctorCommand } from './cli-doctor.js'
import { findFixtureArg, renderFixtureCommand } from './cli-fixture-commands.js'
import { renderGitHubWriteExecutorCommand } from './cli-github-write-executor.js'
import { runIndexCommand } from './cli-index.js'
import {
  renderCheckpointListCommand,
  renderCheckpointShowCommand,
  renderCheckpointRestoreCommand,
} from './cli-checkpoint.js'
import { renderMcpListCommand, renderMcpToolsCommand, renderMcpCallCommand } from './cli-mcp.js'
import { renderMissionPacketCommand } from './cli-mission-packet.js'
import { renderSubagentListCommand, runSubagentRunCommand } from './cli-subagent.js'
import { renderWebFetchCommand, renderWebSearchCommand } from './cli-web.js'
import { runPreflightCommand } from './cli-preflight.js'
import { renderProjectContextCommand } from './cli-project-context.js'
import { renderProvidersCommand } from './cli-providers.js'
import { renderReleaseReadinessCommand } from './cli-release-readiness.js'
import { renderRepairLoopCommand } from './cli-repair-loop.js'
import { renderRuntimeAjnaLiveRead } from './cli-runtime-ajna-live-read.js'
import { renderRuntimeApplyPatch } from './cli-runtime-apply-patch.js'
import { renderRuntimeCiReview } from './cli-runtime-ci-review.js'
import { renderRuntimeGitHubLiveRead } from './cli-runtime-github-live-read.js'
import { renderRuntimeGitHubWriteGate } from './cli-runtime-github-write-gate.js'
import { renderRuntimeGitHubWriteProposal } from './cli-runtime-github-write-proposal.js'
import { renderRuntimeLiveReadClientFixture } from './cli-runtime-live-read-client-fixture.js'
import { renderRuntimeLiveReadPolicy } from './cli-runtime-live-read-policy.js'
import { renderRuntimeLocalWrite } from './cli-runtime-local-write.js'
import { renderRuntimeOperatorReview } from './cli-runtime-operator-review.js'
import { renderRuntimePlan } from './cli-runtime-plan.js'
import { renderRuntimePrNotes } from './cli-runtime-pr-notes.js'
import { renderRuntimePrPreparation } from './cli-runtime-pr-preparation.js'
import { renderRuntimeProposePatch } from './cli-runtime-propose-patch.js'
import { renderRuntimeRead } from './cli-runtime-read.js'
import { renderRuntimeRun } from './cli-runtime-run.js'
import { renderRuntimeSearch } from './cli-runtime-search.js'
import { renderRuntimeStatusDashboardCommand } from './cli-runtime-status-dashboard.js'
import { renderRuntimeValidationCommand } from './cli-runtime-validation-command.js'
import { renderRuntimeValidationPlan } from './cli-runtime-validation-plan.js'
import { renderRuntimeWorkflow } from './cli-runtime-workflow.js'
import { renderRuntimeWriteIntent } from './cli-runtime-write-intent.js'
import { renderRuntimeAjnaWorkflow } from './cli-runtime-ajna-workflow.js'
import { renderScan, scanRepo } from './cli-scan.js'
import { renderTraceStoreCommand } from './cli-trace-store.js'
import { renderVersionCommand } from './cli-version.js'
import { runAgentCommand, renderSessionsList } from './cli-agent.js'
import { runOperatorCommand } from './operator/operator-console.js'
import { SessionPersistence } from './storage/session-persistence.js'
import { resolveStoragePaths } from './storage/storage-paths.js'

const NOT_YET_ACTIVE = new Set<string>()

const [, , command, ...rest] = process.argv

async function main(): Promise<void> {
  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(renderHelp())
      break

    case '--version':
    case '-v':
      console.log(renderVersionCommand(process.cwd()))
      break

    case 'status':
      console.log(renderStatus())
      break

    case 'operator':
      await runOperatorCommand(rest)
      break

    case 'agent':
      await runAgentCommand(rest)
      break

    case 'providers':
      console.log(renderProvidersCommand(rest))
      break

    case 'sessions': {
      const paths = resolveStoragePaths(process.cwd())
      const persistence = new SessionPersistence(paths.sessionsDir)
      console.log(renderSessionsList(persistence))
      break
    }

    case 'index':
      console.log(await runIndexCommand(rest))
      break

    case 'plan':
      console.log(await renderRuntimePlan(rest.join(' ')))
      break

    case 'read':
      console.log(await renderRuntimeRead(rest[0] ?? ''))
      break

    case 'search':
      console.log(await renderRuntimeSearch(rest.join(' ')))
      break

    case 'validation-plan':
      console.log(await renderRuntimeValidationPlan(rest.length > 0 ? rest.join(' ') : undefined))
      break

    case 'propose-patch':
      console.log(await renderRuntimeProposePatch(rest.join(' ')))
      break

    case 'pr-notes': {
      const fixture = findFixtureArg(rest)
      if (fixture !== undefined) {
        console.log(await renderFixtureCommand('pr-notes', fixture))
        break
      }
      console.log(await renderRuntimePrNotes(rest.length > 0 ? rest.join(' ') : undefined))
      break
    }

    case 'ci-review': {
      const fixture = findFixtureArg(rest)
      if (fixture !== undefined) {
        console.log(await renderFixtureCommand('ci-review', fixture))
        break
      }
      console.log(await renderRuntimeCiReview(rest.length > 0 ? rest.join(' ') : undefined))
      break
    }

    case 'ajna-live-read':
      console.log(
        await renderRuntimeAjnaLiveRead(requireInput('codemind ajna-live-read <json-file>')),
      )
      break

    case 'github-live-read':
      console.log(
        await renderRuntimeGitHubLiveRead(requireInput('codemind github-live-read <json-file>')),
      )
      break

    case 'live-read-client-fixture':
      console.log(
        await renderRuntimeLiveReadClientFixture(
          requireInput('codemind live-read-client-fixture <json-file>'),
        ),
      )
      break

    case 'live-read-policy':
      console.log(
        await renderRuntimeLiveReadPolicy(requireInput('codemind live-read-policy <json-file>')),
      )
      break

    case 'operator-review':
      console.log(
        await renderRuntimeOperatorReview(requireInput('codemind operator-review <json-file>')),
      )
      break

    case 'write-intent':
      console.log(await renderRuntimeWriteIntent(requireInput('codemind write-intent <json-file>')))
      break

    case 'local-write':
      console.log(await renderRuntimeLocalWrite(requireInput('codemind local-write <json-file>')))
      break

    case 'apply-patch':
      console.log(await renderRuntimeApplyPatch(requireInput('codemind apply-patch <json-file>')))
      break

    case 'repair-loop':
      console.log(renderRepairLoopCommand(requireInput('codemind repair-loop <json-file>')))
      break

    case 'validation-command':
      console.log(
        await renderRuntimeValidationCommand(
          requireInput('codemind validation-command <json-file>'),
        ),
      )
      break

    case 'pr-preparation':
      console.log(
        await renderRuntimePrPreparation(requireInput('codemind pr-preparation <json-file>')),
      )
      break

    case 'github-write-proposal':
      console.log(
        await renderRuntimeGitHubWriteProposal(
          requireInput('codemind github-write-proposal <json-file>'),
        ),
      )
      break

    case 'github-write-executor':
      console.log(
        await renderGitHubWriteExecutorCommand(
          requireInput('codemind github-write-executor <json-file>'),
        ),
      )
      break

    case 'github-write-gate':
      console.log(
        await renderRuntimeGitHubWriteGate(requireInput('codemind github-write-gate <json-file>')),
      )
      break

    case 'mission-packet':
      console.log(renderMissionPacketCommand(requireInput('codemind mission-packet <json-file>')))
      break

    case 'audit-ledger':
      console.log(renderAuditLedgerCommand(requireInput('codemind audit-ledger <json-file>')))
      break

    case 'trace-store':
      console.log(renderTraceStoreCommand(requireInput('codemind trace-store <json-file>')))
      break

    case 'build-ledger':
      console.log(renderBuildLedgerCommand(process.cwd()))
      break

    case 'doctor':
      console.log(renderDoctorCommand(process.cwd()))
      break

    case 'version':
      console.log(renderVersionCommand(process.cwd()))
      break

    case 'release-readiness':
      console.log(renderReleaseReadinessCommand(process.cwd()))
      break

    case 'runtime-status':
      console.log(renderRuntimeStatusDashboardCommand())
      break

    case 'project-context': {
      const dir = rest[0] ?? process.cwd()
      console.log(renderProjectContextCommand(dir))
      break
    }

    case 'ajna-workflow':
      console.log(
        await renderRuntimeAjnaWorkflow(requireInput('codemind ajna-workflow <json-file>')),
      )
      break

    case 'workflow':
      console.log(await renderRuntimeWorkflow(requireInput('codemind workflow <json-file>')))
      break

    case 'runtime': {
      const [subcommand, ...runtimeArgs] = rest
      if (subcommand === 'run') {
        console.log(await renderRuntimeRun(runtimeArgs))
        break
      }
      console.log(renderNotYetActive(rest.length > 0 ? `runtime ${rest.join(' ')}` : 'runtime'))
      break
    }

    case 'scan': {
      const dir = rest[0] ?? process.cwd()
      console.log(renderScan(scanRepo(dir)))
      break
    }

    case 'preflight': {
      const preflightResult = await runPreflightCommand(rest)
      console.log(preflightResult.output)
      if (preflightResult.blocking) {
        process.exitCode = 1
      }
      break
    }

    case 'ajna':
      await handleAjnaCommand(rest)
      break

    case 'mcp':
      await handleMcpCommand(rest)
      break

    case 'web':
      await handleWebCommand(rest)
      break

    case 'checkpoint':
      handleCheckpointCommand(rest)
      break

    case 'subagent':
      await handleSubagentCommand(rest)
      break

    default:
      if (NOT_YET_ACTIVE.has(command)) {
        const full = rest.length > 0 ? `${command} ${rest.join(' ')}` : command
        console.log(renderNotYetActive(full))
      } else {
        console.error(`Unknown command: ${command}`)
        console.error('Run "codemind help" for available commands.')
        process.exit(1)
      }
  }
}

async function handleAjnaCommand(args: readonly string[]): Promise<void> {
  const [subcommand, maybeInput] = args

  if (subcommand === 'scan-profile') {
    const dir = maybeInput ?? process.cwd()
    console.log(renderAjnaScanProfileForRepo(dir))
    return
  }

  if (subcommand === 'docs') {
    console.log(renderAjnaDocsReference())
    return
  }

  if (subcommand === 'client-pipeline-manifest') {
    console.log(renderAjnaClientPipelineManifest())
    return
  }

  if (subcommand === 'client-pipeline-status') {
    console.log(renderAjnaClientPipelineCheck())
    return
  }

  if (subcommand === 'review-pr') {
    console.log(
      renderAjnaReviewPrForFile(
        requireAjnaInput(maybeInput, 'codemind ajna review-pr <json-file>'),
      ),
    )
    return
  }

  if (subcommand === 'review-pr-github-fixture') {
    console.log(
      renderAjnaReviewPrGithubFixtureForFile(
        requireAjnaInput(maybeInput, 'codemind ajna review-pr-github-fixture <json-file>'),
      ),
    )
    return
  }

  if (subcommand === 'review-pr-github-api-fixture') {
    console.log(
      renderAjnaReviewPrGithubApiFixtureForFile(
        requireAjnaInput(maybeInput, 'codemind ajna review-pr-github-api-fixture <json-file>'),
      ),
    )
    return
  }

  if (subcommand === 'github-api-snapshot-fixture') {
    console.log(
      renderAjnaGithubApiSnapshotFixtureForFile(
        requireAjnaInput(maybeInput, 'codemind ajna github-api-snapshot-fixture <json-file>'),
      ),
    )
    return
  }

  if (subcommand === 'client-collector-fixture') {
    console.log(
      await renderAjnaClientCollectorFixtureForFile(
        requireAjnaInput(maybeInput, 'codemind ajna client-collector-fixture <json-file>'),
      ),
    )
    return
  }

  if (subcommand === 'review-pr-client-collector-fixture') {
    console.log(
      await renderAjnaReviewPrClientCollectorFixtureForFile(
        requireAjnaInput(
          maybeInput,
          'codemind ajna review-pr-client-collector-fixture <json-file>',
        ),
      ),
    )
    return
  }

  if (subcommand === 'merge-readiness-client-collector-fixture') {
    console.log(
      await renderAjnaMergeReadinessClientCollectorFixtureForFile(
        requireAjnaInput(
          maybeInput,
          'codemind ajna merge-readiness-client-collector-fixture <json-file>',
        ),
      ),
    )
    return
  }

  if (subcommand === 'review-pr-collector-fixture') {
    console.log(
      renderAjnaReviewPrCollectorFixtureForFile(
        requireAjnaInput(maybeInput, 'codemind ajna review-pr-collector-fixture <json-file>'),
      ),
    )
    return
  }

  if (subcommand === 'review-pr-readonly-collector-fixture') {
    console.log(
      await renderAjnaReviewPrReadOnlyCollectorFixtureForFile(
        requireAjnaInput(
          maybeInput,
          'codemind ajna review-pr-readonly-collector-fixture <json-file>',
        ),
      ),
    )
    return
  }

  if (subcommand === 'github-readonly-collector-fixture') {
    console.log(
      await renderAjnaGithubReadOnlyCollectorFixtureForFile(
        requireAjnaInput(maybeInput, 'codemind ajna github-readonly-collector-fixture <json-file>'),
      ),
    )
    return
  }

  if (subcommand === 'merge-readiness') {
    console.log(
      renderAjnaMergeReadinessForFile(
        requireAjnaInput(maybeInput, 'codemind ajna merge-readiness <json-file>'),
      ),
    )
    return
  }

  const full = args.length > 0 ? `ajna ${args.join(' ')}` : 'ajna'
  console.log(renderNotYetActive(full))
}

async function handleMcpCommand(args: readonly string[]): Promise<void> {
  const [subcommand, ...mcpArgs] = args

  if (subcommand === 'list') {
    console.log(await renderMcpListCommand(mcpArgs))
    return
  }

  if (subcommand === 'tools') {
    console.log(await renderMcpToolsCommand(mcpArgs))
    return
  }

  if (subcommand === 'call') {
    console.log(await renderMcpCallCommand(mcpArgs))
    return
  }

  const full = args.length > 0 ? `mcp ${args.join(' ')}` : 'mcp'
  console.log(renderNotYetActive(full))
}

async function handleWebCommand(args: readonly string[]): Promise<void> {
  const [subcommand, ...webArgs] = args

  if (subcommand === 'fetch') {
    console.log(await renderWebFetchCommand(webArgs))
    return
  }

  if (subcommand === 'search') {
    console.log(await renderWebSearchCommand(webArgs))
    return
  }

  const full = args.length > 0 ? `web ${args.join(' ')}` : 'web'
  console.log(renderNotYetActive(full))
}

function handleCheckpointCommand(args: readonly string[]): void {
  const [subcommand, ...checkpointArgs] = args

  if (subcommand === 'list') {
    console.log(renderCheckpointListCommand(checkpointArgs))
    return
  }

  if (subcommand === 'show') {
    console.log(renderCheckpointShowCommand(checkpointArgs))
    return
  }

  if (subcommand === 'restore') {
    console.log(renderCheckpointRestoreCommand(checkpointArgs))
    return
  }

  const full = args.length > 0 ? `checkpoint ${args.join(' ')}` : 'checkpoint'
  console.log(renderNotYetActive(full))
}

async function handleSubagentCommand(args: readonly string[]): Promise<void> {
  const [subcommand, ...subagentArgs] = args

  if (subcommand === 'list') {
    console.log(renderSubagentListCommand())
    return
  }

  if (subcommand === 'run') {
    console.log(await runSubagentRunCommand(subagentArgs))
    return
  }

  const full = args.length > 0 ? `subagent ${args.join(' ')}` : 'subagent'
  console.log(renderNotYetActive(full))
}

function requireInput(usage: string): string {
  return requireAjnaInput(rest[0], usage)
}

function requireAjnaInput(input: string | undefined, usage: string): string {
  if (input === undefined) {
    console.error(`Missing input JSON file: ${usage}`)
    process.exit(1)
  }
  return input
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
