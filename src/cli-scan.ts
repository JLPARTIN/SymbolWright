import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

export interface CodemindRepoScan {
  readonly rootDir: string
  readonly packageName: string | null
  readonly packageVersion: string | null
  readonly packageDescription: string | null
  readonly topLevelDirs: readonly string[]
  readonly tsFileCount: number
  readonly specFileCount: number
  readonly hasGit: boolean
  readonly hasTypeScriptConfig: boolean
  readonly hasEslintConfig: boolean
  readonly hasPrettierConfig: boolean
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage'])

function walkDir(dir: string, counts: { ts: number; spec: number }): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const entryPath = join(dir, entry)
    try {
      const stat = statSync(entryPath)
      if (stat.isDirectory()) {
        walkDir(entryPath, counts)
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        counts.ts++
        if (entry.endsWith('.spec.ts') || entry.endsWith('.test.ts')) {
          counts.spec++
        }
      }
    } catch {
      // skip unreadable entries (broken symlinks, permission errors)
    }
  }
}

export function scanRepo(rootDir: string): CodemindRepoScan {
  let packageName: string | null = null
  let packageVersion: string | null = null
  let packageDescription: string | null = null

  const pkgPath = join(rootDir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
      if (typeof pkg['name'] === 'string') packageName = pkg['name']
      if (typeof pkg['version'] === 'string') packageVersion = pkg['version']
      if (typeof pkg['description'] === 'string') packageDescription = pkg['description']
    } catch {
      // ignore parse errors
    }
  }

  const topLevelDirs: string[] = []
  try {
    for (const entry of readdirSync(rootDir)) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue
      try {
        if (statSync(join(rootDir, entry)).isDirectory()) topLevelDirs.push(entry)
      } catch {
        // skip
      }
    }
  } catch {
    // ignore unreadable root
  }

  const counts = { ts: 0, spec: 0 }
  walkDir(rootDir, counts)

  return {
    rootDir,
    packageName,
    packageVersion,
    packageDescription,
    topLevelDirs: topLevelDirs.sort(),
    tsFileCount: counts.ts,
    specFileCount: counts.spec,
    hasGit: existsSync(join(rootDir, '.git')),
    hasTypeScriptConfig: existsSync(join(rootDir, 'tsconfig.json')),
    hasEslintConfig: existsSync(join(rootDir, 'eslint.config.js')),
    hasPrettierConfig: existsSync(join(rootDir, '.prettierrc')),
  }
}

export function renderScan(scan: CodemindRepoScan): string {
  const lines = [
    `Repository:        ${scan.packageName ?? '(unnamed)'}`,
    `Version:           ${scan.packageVersion ?? '(unknown)'}`,
  ]
  if (scan.packageDescription) {
    lines.push(`Description:       ${scan.packageDescription}`)
  }
  lines.push(
    `Root:              ${scan.rootDir}`,
    '',
    `TypeScript files:  ${scan.tsFileCount} (${scan.specFileCount} spec files)`,
    `Directories:       ${scan.topLevelDirs.length > 0 ? scan.topLevelDirs.join(', ') : '(none)'}`,
    '',
    'Tooling:',
    `  TypeScript:      ${scan.hasTypeScriptConfig ? 'yes' : 'no'}`,
    `  ESLint:          ${scan.hasEslintConfig ? 'yes' : 'no'}`,
    `  Prettier:        ${scan.hasPrettierConfig ? 'yes' : 'no'}`,
    `  Git:             ${scan.hasGit ? 'yes' : 'no'}`,
    '',
    'Mode: READ_ONLY — no files modified',
  )
  return lines.join('\n')
}
