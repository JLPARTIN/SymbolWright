import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveAcquisitionRoot } from './github/repository-acquisition.js'
import { parsePruneReposArgs, runPruneReposCommand } from './cli-prune-repos.js'

describe('parsePruneReposArgs', () => {
  it('defaults every flag to off', () => {
    expect(parsePruneReposArgs([])).toEqual({
      json: false,
      quarantineOnly: false,
      finalizeOnly: false,
    })
  })

  it('parses --json, --quarantine-only, and --finalize-only', () => {
    expect(parsePruneReposArgs(['--json'])).toEqual({
      json: true,
      quarantineOnly: false,
      finalizeOnly: false,
    })
    expect(parsePruneReposArgs(['--quarantine-only'])).toMatchObject({ quarantineOnly: true })
    expect(parsePruneReposArgs(['--finalize-only'])).toMatchObject({ finalizeOnly: true })
  })

  it('rejects an unknown flag', () => {
    expect(() => parsePruneReposArgs(['--bogus'])).toThrow('Unknown prune-repos flag')
  })

  it('rejects combining --quarantine-only with --finalize-only', () => {
    expect(() => parsePruneReposArgs(['--quarantine-only', '--finalize-only'])).toThrow(
      'mutually exclusive',
    )
  })
})

describe('runPruneReposCommand', () => {
  let workspaceRoot: string

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'symbolwright-cli-prune-repos-'))
  })

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true })
  })

  function makeOrphan(name: string): void {
    const dir = join(resolveAcquisitionRoot(workspaceRoot), name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'marker.txt'), 'x')
  }

  it('reports a quarantine-and-finalize sweep as JSON', async () => {
    makeOrphan('orphan')

    const output = await runPruneReposCommand(workspaceRoot, ['--json'])
    const parsed = JSON.parse(output) as { quarantined: string[]; stillWithinGrace: number }

    expect(parsed.quarantined).toHaveLength(1)
    expect(parsed.stillWithinGrace).toBe(1)
  })

  it('renders a human-readable summary by default', async () => {
    makeOrphan('orphan')

    const output = await runPruneReposCommand(workspaceRoot, [])

    expect(output).toContain('external-repository retention sweep')
    expect(output).toContain('Quarantined (newly orphaned): 1')
  })

  it('--quarantine-only skips finalizing anything already in quarantine', async () => {
    makeOrphan('orphan')
    await runPruneReposCommand(workspaceRoot, ['--json'])
    makeOrphan('second-orphan')

    const output = await runPruneReposCommand(workspaceRoot, ['--json', '--quarantine-only'])
    const parsed = JSON.parse(output) as { deleted: string[]; stillWithinGrace: number }

    expect(parsed.deleted).toHaveLength(0)
    expect(parsed.stillWithinGrace).toBe(0)
  })

  it('--finalize-only skips quarantining newly-orphaned workspaces', async () => {
    makeOrphan('never-quarantined')

    const output = await runPruneReposCommand(workspaceRoot, ['--json', '--finalize-only'])
    const parsed = JSON.parse(output) as { quarantined: string[] }

    expect(parsed.quarantined).toHaveLength(0)
  })
})
