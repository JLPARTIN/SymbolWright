import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { detectPackageManager } from '../../src/forensics/package-manager.js'

const roots: string[] = []

function makeRepo(files: readonly string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-pm-'))
  roots.push(root)
  for (const file of files) {
    fs.writeFileSync(path.join(root, file), 'lock')
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('package manager detection', () => {
  it('detects package manager from lockfiles', () => {
    expect(detectPackageManager(makeRepo(['pnpm-lock.yaml']))).toBe('pnpm')
    expect(detectPackageManager(makeRepo(['yarn.lock']))).toBe('yarn')
    expect(detectPackageManager(makeRepo(['package-lock.json']))).toBe('npm')
    expect(detectPackageManager(makeRepo(['npm-shrinkwrap.json']))).toBe('npm')
  })

  it('blocks conflicts and unknown package managers', () => {
    expect(detectPackageManager(makeRepo(['package-lock.json', 'pnpm-lock.yaml']))).toBe('conflict')
    expect(detectPackageManager(makeRepo([]))).toBe('unknown')
  })
})
