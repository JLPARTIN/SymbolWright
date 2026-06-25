#!/usr/bin/env node
import { renderAjnaClientCollectorFixtureForFile } from './cli-ajna-client-collector-fixture.js'
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
import { renderHelp, renderNotYetActive, renderStatus } from './cli-commands.js'
import { renderScan, scanRepo } from './cli-scan.js'

const NOT_YET_ACTIVE = new Set([
  'plan',
  'read',
  'search',
  'propose-patch',
  'validation-plan',
  'ci-review',
  'pr-notes',
])

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
