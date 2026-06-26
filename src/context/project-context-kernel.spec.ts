import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildProjectContextPacket,
  renderProjectContextPacket,
} from './project-context-kernel.js'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-ctx-'))
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.resolve(dir, relPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf8')
}

describe('buildProjectContextPacket', () => {
  it('detects README.md when present', () => {
    const dir = makeTempDir()
    writeFile(dir, 'README.md', '# Test Project\n\nDescription here.')
    writeFile(dir, 'package.json', JSON.stringify({ scripts: { test: 'vitest run' } }))

    const packet = buildProjectContextPacket(dir)

    expect(packet.instructionSet.foundCount).toBeGreaterThanOrEqual(1)
    const readme = packet.instructionSet.instructions.find((i) => i.fileName === 'README.md')
    expect(readme?.exists).toBe(true)
    expect(readme?.lineCount).toBe(3)
    expect(readme?.contentSummary).toBe('Test Project')
  })

  it('reports missing instruction files', () => {
    const dir = makeTempDir()
    writeFile(dir, 'package.json', JSON.stringify({}))

    const packet = buildProjectContextPacket(dir)

    expect(packet.instructionSet.missingCount).toBeGreaterThan(0)
    const claude = packet.instructionSet.instructions.find((i) => i.fileName === 'CLAUDE.md')
    expect(claude?.exists).toBe(false)
  })

  it('loads package scripts', () => {
    const dir = makeTempDir()
    writeFile(
      dir,
      'package.json',
      JSON.stringify({
        scripts: {
          typecheck: 'tsc --noEmit',
          test: 'vitest run',
          build: 'tsc',
        },
      }),
    )

    const packet = buildProjectContextPacket(dir)

    expect(packet.packageScripts).toHaveLength(3)
    expect(packet.validationCommands).toContain('npm run typecheck')
    expect(packet.validationCommands).toContain('npm run test')
    expect(packet.validationCommands).toContain('npm run build')
  })

  it('handles missing package.json', () => {
    const dir = makeTempDir()

    const packet = buildProjectContextPacket(dir)

    expect(packet.packageScripts).toHaveLength(0)
    expect(packet.validationCommands).toHaveLength(0)
  })

  it('detects workflow files when present', () => {
    const dir = makeTempDir()
    writeFile(dir, 'package.json', JSON.stringify({}))
    writeFile(dir, '.github/workflows/ci.yml', 'name: CI')

    const packet = buildProjectContextPacket(dir)

    const ciWorkflow = packet.workflows.find((w) => w.fileName === '.github/workflows/ci.yml')
    expect(ciWorkflow?.exists).toBe(true)
  })

  it('reports missing workflow files', () => {
    const dir = makeTempDir()
    writeFile(dir, 'package.json', JSON.stringify({}))

    const packet = buildProjectContextPacket(dir)

    for (const w of packet.workflows) {
      expect(w.exists).toBe(false)
    }
  })

  it('scans docs directories', () => {
    const dir = makeTempDir()
    writeFile(dir, 'package.json', JSON.stringify({}))
    writeFile(dir, 'docs/roadmap/PLAN.md', '# Plan')

    const packet = buildProjectContextPacket(dir)

    expect(packet.docsPresent).toContain(path.join('docs/roadmap', 'PLAN.md'))
  })

  it('includes operator directives and risk boundaries', () => {
    const dir = makeTempDir()
    writeFile(dir, 'package.json', JSON.stringify({}))

    const packet = buildProjectContextPacket(dir)

    expect(packet.operatorDirectives.length).toBeGreaterThan(0)
    expect(packet.riskBoundaries.length).toBeGreaterThan(0)
    expect(packet.riskBoundaries).toContain('no auto-merge')
  })

  it('includes build ledger with all phases', () => {
    const dir = makeTempDir()
    writeFile(dir, 'package.json', JSON.stringify({}))

    const packet = buildProjectContextPacket(dir)

    expect(packet.buildLedger.totalPhases).toBe(20)
    expect(packet.buildLedger.completedPhases).toBe(20)
  })

  it('redacts secrets in instruction content', () => {
    const dir = makeTempDir()
    writeFile(dir, 'README.md', '# Project\napi_key: sk-abcdef1234567890abcdef1234567890abcdef1234567890')
    writeFile(dir, 'package.json', JSON.stringify({}))

    const packet = buildProjectContextPacket(dir)
    const readme = packet.instructionSet.instructions.find((i) => i.fileName === 'README.md')

    expect(readme?.exists).toBe(true)
    expect(readme?.contentSummary).not.toContain('sk-abcdef')
  })

  it('does not read protected paths', () => {
    const dir = makeTempDir()
    writeFile(dir, '.env', 'SECRET=value')
    writeFile(dir, 'package.json', JSON.stringify({}))

    const packet = buildProjectContextPacket(dir)

    const env = packet.instructionSet.instructions.find((i) => i.fileName === '.env')
    expect(env).toBeUndefined()
  })

  it('resolves rootDir to absolute path', () => {
    const dir = makeTempDir()
    writeFile(dir, 'package.json', JSON.stringify({}))

    const packet = buildProjectContextPacket(dir)

    expect(path.isAbsolute(packet.rootDir)).toBe(true)
  })
})

describe('renderProjectContextPacket', () => {
  it('renders a complete context packet', () => {
    const dir = makeTempDir()
    writeFile(dir, 'README.md', '# Test\n\nHello')
    writeFile(dir, 'package.json', JSON.stringify({ scripts: { test: 'vitest run', build: 'tsc' } }))
    writeFile(dir, '.github/workflows/ci.yml', 'name: CI')

    const packet = buildProjectContextPacket(dir)
    const output = renderProjectContextPacket(packet)

    expect(output).toContain('CodeMind Project Context Packet')
    expect(output).toContain('--- Instructions ---')
    expect(output).toContain('README.md: 3 lines')
    expect(output).toContain('--- Build State ---')
    expect(output).toContain('20/20 complete')
    expect(output).toContain('--- Package Scripts ---')
    expect(output).toContain('test: vitest run')
    expect(output).toContain('--- Workflows ---')
    expect(output).toContain('ci.yml: FOUND')
    expect(output).toContain('--- Operator Directives ---')
    expect(output).toContain('plan-first by default')
    expect(output).toContain('--- Risk Boundaries ---')
    expect(output).toContain('no auto-merge')
    expect(output).toContain('--- Validation Commands ---')
    expect(output).toContain('npm run test')
  })

  it('renders empty docs section when no docs present', () => {
    const dir = makeTempDir()
    writeFile(dir, 'package.json', JSON.stringify({}))

    const packet = buildProjectContextPacket(dir)
    const output = renderProjectContextPacket(packet)

    expect(output).toContain('--- Docs Present ---')
    expect(output).toContain('(none)')
  })
})
