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
import { findFixtureArg, renderFixtureCommand } from './cli-fixture-commands.js'
import { renderHelp, renderNotYetActive, renderStatus } from './cli-commands.js'
import { renderAuditLedgerCommand } from './cli-audit-ledger.js'
import { renderDoctorCommand } from './cli-doctor.js'
import { renderMissionPacketCommand } from './cli-mission-packet.js'
import { renderReleaseReadinessCommand } from './cli-release-readiness.js'
import { renderTraceStoreCommand } from './cli-trace-store.js'
import { renderVersionCommand } from './cli-version.js'
import { renderRuntimeCiReview } from './cli-runtime-ci-review.js'
import { renderRuntimePlan } from './cli-runtime-plan.js'
import { renderRuntimePrNotes } from './cli-runtime-pr-notes.js'
import { renderRuntimeProposePatch } from './cli-runtime-propose-patch.js'
import { renderRuntimeRead } from './cli-runtime-read.js'
import { renderRuntimeAjnaLiveRead } from './cli-runtime-ajna-live-read.js'
import { renderRuntimeOperatorReview } from './cli-runtime-operator-review.js'
import { renderRuntimeLocalWrite } from './cli-runtime-local-write.js'
import { renderRuntimePrPreparation } from './cli-runtime-pr-preparation.js'
import { renderRepairLoopCommand } from './cli-repair-loop.js'
import { renderRuntimeApplyPatch } from './cli-runtime-apply-patch.js'
import { renderRuntimeValidationCommand } from './cli-runtime-validation-command.js'
import { renderRuntimeWriteIntent } from './cli-runtime-write-intent.js'
import { renderRuntimeGitHubLiveRead } from './cli-runtime-github-live-read.js'
import { renderRuntimeGitHubWriteProposal } from './cli-runtime-github-write-proposal.js'
import { renderGitHubWriteExecutorCommand } from './cli-github-write-executor.js'
import { renderRuntimeGitHubWriteGate } from './cli-runtime-github-write-gate.js'
import { renderRuntimeWorkflow } from './cli-runtime-workflow.js'
import { renderRuntimeAjnaWorkflow } from './cli-runtime-ajna-workflow.js'
import { renderRuntimeStatusDashboardCommand } from './cli-runtime-status-dashboard.js'
import { renderProjectContextCommand } from './cli-project-context.js'
import { renderRuntimeLiveReadClientFixture } from './cli-runtime-live-read-client-fixture.js'
import { renderRuntimeLiveReadPolicy } from './cli-runtime-live-read-policy.js'
import { renderRuntimeRun } from './cli-runtime-run.js'
import { renderApprovedRuntimeRun } from './cli-runtime-approved-run.js'
import { renderRuntimeSearch } from './cli-runtime-search.js'
import { renderRuntimeValidationPlan } from './cli-runtime-validation-plan.js'
import { renderScan, scanRepo } from './cli-scan.js'
import { runAgentCommand } from './cli-agent.js'

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

    case 'status':
      console.log(renderStatus())
      break

    case 'agent':
      await runAgentCommand(rest)
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

    case 'ajna-live-read': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind ajna-live-read <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeAjnaLiveRead(fixturePath))
      break
    }

    case 'github-live-read': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind github-live-read <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeGitHubLiveRead(fixturePath))
      break
    }

    case 'live-read-client-fixture': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind live-read-client-fixture <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeLiveReadClientFixture(fixturePath))
      break
    }

    case 'live-read-policy': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind live-read-policy <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeLiveReadPolicy(fixturePath))
      break
    }

    case 'operator-review': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind operator-review <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeOperatorReview(fixturePath))
      break
    }

    case 'write-intent': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind write-intent <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeWriteIntent(fixturePath))
      break
    }

    case 'local-write': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind local-write <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeLocalWrite(fixturePath))
      break
    }

    case 'apply-patch': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind apply-patch <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeApplyPatch(fixturePath))
      break
    }

    case 'repair-loop': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind repair-loop <json-file>')
        process.exit(1)
      }
      console.log(renderRepairLoopCommand(fixturePath))
      break
    }

    case 'validation-command': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind validation-command <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeValidationCommand(fixturePath))
      break
    }

    case 'pr-preparation': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind pr-preparation <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimePrPreparation(fixturePath))
      break
    }

    case 'github-write-proposal': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind github-write-proposal <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeGitHubWriteProposal(fixturePath))
      break
    }

    case 'github-write-executor': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind github-write-executor <json-file>')
        process.exit(1)
      }
      console.log(await renderGitHubWriteExecutorCommand(fixturePath))
      break
    }

    case 'github-write-gate': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind github-write-gate <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeGitHubWriteGate(fixturePath))
      break
    }

    case 'mission-packet': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind mission-packet <json-file>')
        process.exit(1)
      }
      console.log(renderMissionPacketCommand(fixturePath))
      break
    }

    case 'audit-ledger': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind audit-ledger <json-file>')
        process.exit(1)
      }
      console.log(renderAuditLedgerCommand(fixturePath))
      break
    }

    case 'trace-store': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind trace-store <json-file>')
        process.exit(1)
      }
      console.log(renderTraceStoreCommand(fixturePath))
      break
    }

    case 'doctor': {
      console.log(renderDoctorCommand(process.cwd()))
      break
    }

    case 'version': {
      console.log(renderVersionCommand(process.cwd()))
      break
    }

    case 'release-readiness': {
      console.log(renderReleaseReadinessCommand(process.cwd()))
      break
    }

    case 'runtime-status': {
      console.log(renderRuntimeStatusDashboardCommand())
      break
    }

    case 'project-context': {
      const dir = rest[0] ?? process.cwd()
      console.log(renderProjectContextCommand(dir))
      break
    }

    case 'ajna-workflow': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind ajna-workflow <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeAjnaWorkflow(fixturePath))
      break
    }

    case 'workflow': {
      const fixturePath = rest[0]
      if (fixturePath === undefined) {
        console.error('Missing input JSON file: codemind workflow <json-file>')
        process.exit(1)
      }
      console.log(await renderRuntimeWorkflow(fixturePath))
      break
    }

    case 'runtime': {
      const [subcommand, ...runtimeArgs] = rest
      if (subcommand === 'run') {
        if (runtimeArgs.includes('--approval-ticket')) {
          console.log(await renderApprovedRuntimeRun(runtimeArgs))
          break
        }
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

    case 'ajna': {
      const [subcommand, maybeInput] = rest
      if (subcommand === 'scan-profile') {
        const dir = maybeInput ?? process.cwd()
        console.log(renderAjnaScanProfileForRepo(dir))
        break
      }

      if (subcommand === 'docs') {
        console.log(renderAjnaDocsReference())
        break
      }

      if (subcommand === 'client-pipeline-manifest') {
        console.log(renderAjnaClientPipelineManifest())
        break
      }

      if (subcommand === 'client-pipeline-status') {
        console.log(renderAjnaClientPipelineCheck())
        break
      }

      if (subcommand === 'review-pr') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna review-pr <json-file>')
          process.exit(1)
        }
        console.log(renderAjnaReviewPrForFile(maybeInput))
        break
      }

      if (subcommand === 'review-pr-github-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna review-pr-github-fixture <json-file>')
          process.exit(1)
        }
        console.log(renderAjnaReviewPrGithubFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'review-pr-github-api-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna review-pr-github-api-fixture <json-file>')
          process.exit(1)
        }
        console.log(renderAjnaReviewPrGithubApiFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'github-api-snapshot-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna github-api-snapshot-fixture <json-file>')
          process.exit(1)
        }
        console.log(renderAjnaGithubApiSnapshotFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'client-collector-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna client-collector-fixture <json-file>')
          process.exit(1)
        }
        console.log(await renderAjnaClientCollectorFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'review-pr-client-collector-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna review-pr-client-collector-fixture <json-file>')
          process.exit(1)
        }
        console.log(await renderAjnaReviewPrClientCollectorFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'merge-readiness-client-collector-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna merge-readiness-client-collector-fixture <json-file>')
          process.exit(1)
        }
        console.log(await renderAjnaMergeReadinessClientCollectorFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'review-pr-collector-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna review-pr-collector-fixture <json-file>')
          process.exit(1)
        }
        console.log(renderAjnaReviewPrCollectorFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'review-pr-readonly-collector-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna review-pr-readonly-collector-fixture <json-file>')
          process.exit(1)
        }
        console.log(await renderAjnaReviewPrReadOnlyCollectorFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'github-readonly-collector-fixture') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna github-readonly-collector-fixture <json-file>')
          process.exit(1)
        }
        console.log(await renderAjnaGithubReadOnlyCollectorFixtureForFile(maybeInput))
        break
      }

      if (subcommand === 'merge-readiness') {
        if (maybeInput === undefined) {
          console.error('Missing input JSON file: codemind ajna merge-readiness <json-file>')
          process.exit(1)
        }
        console.log(renderAjnaMergeReadinessForFile(maybeInput))
        break
      }

      const full = rest.length > 0 ? `${command} ${rest.join(' ')}` : command
      console.log(renderNotYetActive(full))
      break
    }

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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
