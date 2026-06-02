#!/usr/bin/env node
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
  'ajna',
])

const [, , command, ...rest] = process.argv

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
