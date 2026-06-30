import type { CommandResult, PackageManager } from './types.js'

export type ScriptEvidenceProvider = (request: {
  readonly repoRoot: string
  readonly packageManager: PackageManager
  readonly script: string
  readonly command: string
}) => Promise<CommandResult> | CommandResult

export function renderScriptCommand(packageManager: PackageManager, script: string): string {
  if (packageManager === 'npm') return `npm run ${script}`
  if (packageManager === 'pnpm') return `pnpm run ${script}`
  if (packageManager === 'yarn') return `yarn run ${script}`
  return `${packageManager} run ${script}`
}

export function createCommandResult(
  packageManager: PackageManager,
  script: string,
  status: CommandResult['status'],
  reason: string,
): CommandResult {
  return {
    script,
    command: renderScriptCommand(packageManager, script),
    packageManager,
    status,
    exitCode: null,
    stdout: '',
    stderr: '',
    durationMs: 0,
    reason,
  }
}

export async function collectCommandEvidence(
  repoRoot: string,
  packageManager: PackageManager,
  requiredScripts: readonly string[],
  availableScripts: ReadonlySet<string>,
  evidenceProvider: ScriptEvidenceProvider,
): Promise<readonly CommandResult[]> {
  if (packageManager === 'unknown' || packageManager === 'conflict') {
    return requiredScripts.map((script) =>
      createCommandResult(packageManager, script, 'blocked', `package manager detection returned ${packageManager}`),
    )
  }

  const results: CommandResult[] = []
  for (const script of requiredScripts) {
    if (!availableScripts.has(script)) {
      results.push(createCommandResult(packageManager, script, 'missing', `${script} is not defined in package.json`))
      continue
    }
    results.push(await evidenceProvider({ repoRoot, packageManager, script, command: renderScriptCommand(packageManager, script) }))
  }
  return results
}
