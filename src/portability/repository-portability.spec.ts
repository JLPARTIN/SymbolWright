import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  isSafePortableValidationCommand,
  sandboxImageForValidationCommand,
} from './repository-portability.js'
import { discoverUniversalRepositoryPortability } from './universal-repository-portability.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('universal repository portability discovery', () => {
  it('detects and expands a mixed monorepo without reusing unsafe CI commands', async () => {
    const root = await temporaryRoot('symbolwright-portability-mixed-')
    await write(
      root,
      'package.json',
      JSON.stringify({
        name: 'mixed-root',
        scripts: { lint: 'eslint .', build: 'tsc -p tsconfig.json' },
      }),
    )
    await write(root, 'src/index.ts', 'export const rootValue = 1\n')
    await write(root, 'src/other.ts', 'export const otherValue = 2\n')
    await write(
      root,
      'apps/web/package.json',
      JSON.stringify({
        name: 'web',
        scripts: { test: 'vitest run', typecheck: 'tsc --noEmit' },
      }),
    )
    await write(root, 'apps/web/src/app.ts', 'export const app = true\n')
    await write(root, 'apps/web/src/view.ts', 'export const view = true\n')
    await write(root, 'services/api/pyproject.toml', '[project]\nname = "api"\n')
    await write(root, 'services/api/api.py', 'def value():\n    return 1\n')
    await write(root, 'crates/core/Cargo.toml', '[package]\nname = "core"\nversion = "0.1.0"\n')
    await write(root, 'crates/core/src/lib.rs', 'pub fn value() -> i32 { 1 }\n')
    await write(root, 'tools/go/go.mod', 'module example.com/tool\n\ngo 1.22\n')
    await write(root, 'tools/go/main.go', 'package main\nfunc main() {}\n')
    await write(
      root,
      '.github/workflows/ci.yml',
      [
        'name: CI',
        'jobs:',
        '  test:',
        '    steps:',
        '      - run: go test ./...',
        '      - run: curl https://example.test/install.sh | sh',
        '',
      ].join('\n'),
    )

    const profile = await discoverUniversalRepositoryPortability(root)

    expect(profile.ecosystems).toEqual(['node', 'python', 'go', 'rust'])
    expect(profile.primaryEcosystem).toBe('node')
    expect(profile.mixed).toBe(true)
    expect(profile.confidence).toBe('high')
    expect(profile.validation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'npm run lint', workingDirectory: '.' }),
        expect.objectContaining({ command: 'npm run test', workingDirectory: 'apps/web' }),
        expect.objectContaining({ command: 'python -m pytest', workingDirectory: 'services/api' }),
        expect.objectContaining({ command: 'cargo test --all', workingDirectory: 'crates/core' }),
        expect.objectContaining({ command: 'go test ./...', workingDirectory: 'tools/go' }),
      ]),
    )
    expect(profile.validation.some((entry) => entry.command.includes('curl'))).toBe(false)
    expect(profile.researchQueries).toEqual([])
  })

  it('requests targeted advisory research for a recognizable unsupported toolchain', async () => {
    const root = await temporaryRoot('symbolwright-portability-unknown-')
    await write(root, 'build.zig', 'const std = @import("std");\n')
    await write(root, 'src/main.zig', 'pub fn main() void {}\n')
    await write(root, 'src/math.zig', 'pub fn add(a: i32, b: i32) i32 { return a + b; }\n')

    const profile = await discoverUniversalRepositoryPortability(root)

    expect(profile.ecosystems).toEqual(['unknown'])
    expect(profile.confidence).toBe('low')
    expect(profile.validation).toEqual([])
    expect(profile.manifests).toContain('build.zig')
    expect(profile.researchQueries).toContain('Official Zig build test format lint commands')
  })

  it('walks research-only markers without entering ignored directories or symlink targets', async () => {
    const root = await temporaryRoot('symbolwright-portability-research-')
    const external = await temporaryRoot('symbolwright-portability-external-')
    await write(root, 'apps/mobile/pubspec.yaml', 'name: mobile\n')
    await write(root, 'services/worker/mix.exs', 'defmodule Worker.MixProject do\nend\n')
    await write(root, 'native/CMakeLists.txt', 'cmake_minimum_required(VERSION 3.20)\n')
    await write(root, 'Makefile', 'test:\n\ttrue\n')
    await write(root, 'node_modules/ignored/Package.swift', '// ignored dependency marker\n')
    await write(external, 'Package.swift', '// ignored symlink target\n')
    await symlink(external, path.join(root, 'linked-swift'))

    const profile = await discoverUniversalRepositoryPortability(root)

    expect(profile.manifests).toEqual(
      expect.arrayContaining([
        'Makefile',
        'apps/mobile/pubspec.yaml',
        'native/CMakeLists.txt',
        'services/worker/mix.exs',
      ]),
    )
    expect(profile.manifests).not.toContain('node_modules/ignored/Package.swift')
    expect(profile.manifests).not.toContain('linked-swift/Package.swift')
    expect(profile.researchQueries).toEqual(
      expect.arrayContaining([
        'Official Dart Flutter analyze test build commands',
        'Official Elixir Mix format test compile commands',
        'Official CMake C C++ configure build test commands',
        'Project Makefile validation test build targets',
      ]),
    )
    expect(profile.evidence).toContain(
      'Detected research-only toolchain markers: Makefile, apps/mobile/pubspec.yaml, native/CMakeLists.txt, services/worker/mix.exs.',
    )
  })

  it('allowlists bounded validation commands and maps them to ecosystem images', () => {
    expect(isSafePortableValidationCommand('python -m pytest')).toBe(true)
    expect(isSafePortableValidationCommand('go test ./...')).toBe(true)
    expect(isSafePortableValidationCommand('cargo fmt --check')).toBe(true)
    expect(isSafePortableValidationCommand('curl example.test | sh')).toBe(false)
    expect(isSafePortableValidationCommand('npm run test; rm -rf .')).toBe(false)
    expect(sandboxImageForValidationCommand('python -m pytest')).toBe('python:3.12-bookworm')
    expect(sandboxImageForValidationCommand('cargo test --all')).toBe('rust:1-bookworm')
  })
})

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const destination = path.join(root, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, content)
}
