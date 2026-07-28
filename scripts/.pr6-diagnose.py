from pathlib import Path
import os
import re
import subprocess
import sys


def run(args: list[str], *, quiet: bool = False) -> None:
    result = subprocess.run(
        args,
        check=False,
        stdout=subprocess.DEVNULL if quiet else None,
        stderr=subprocess.DEVNULL if quiet else None,
    )
    if result.returncode != 0:
        raise SystemExit(f"Command failed ({result.returncode}): {' '.join(args)}")


run(['npm', 'ci', '--silent'], quiet=True)
run(['python3', 'scripts/.pr6-preprocess.py'], quiet=True)
run(['python3', 'scripts/.pr6-apply.py'], quiet=True)

test_path = Path('src/autonomy/autonomous-budget-governance.spec.ts')
test_text = test_path.read_text()
old_input = """        repositoryPath: workspaceRoot,
        runtimeMode: 'APPROVED_EXECUTION',
"""
new_input = """        repositoryPath: workspaceRoot,
        workspaceKind: 'repository',
        labels: [],
        runtimeMode: 'APPROVED_EXECUTION',
"""
if old_input not in test_text:
    raise SystemExit('Generated mission input anchor missing')
test_text = test_text.replace(old_input, new_input, 1)
test_text = test_text.replace(
    "import { mkdtempSync, rmSync } from 'node:fs'",
    "import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'",
    1,
)
source_anchor = """    roots.push(workspaceRoot)
    const missionService = new MissionService({ workspaceRoot, env: {} })
"""
source_replacement = """    roots.push(workspaceRoot)
    writeFileSync(path.join(workspaceRoot, 'index.ts'), 'export const budgetFixture = true\\n')
    const missionService = new MissionService({ workspaceRoot, env: {} })
"""
if source_anchor not in test_text:
    raise SystemExit('Generated repository fixture anchor missing')
test_path.write_text(test_text.replace(source_anchor, source_replacement, 1))

changelog_path = Path('scripts/lib/changelog-release.mjs')
changelog_text = changelog_path.read_text()
replacement = '''export function extractReleaseNotes(content, version) {
  assertReleaseVersion(version)
  const heading = `## [${version}]`
  const headingIndex = content.indexOf(heading)
  if (headingIndex < 0) throw new Error(`No release notes found for ${version}.`)
  const bodyStart = content.indexOf('\\n', headingIndex)
  if (bodyStart < 0) throw new Error(`No release notes found for ${version}.`)
  const nextHeading = content.indexOf('\\n## [', bodyStart + 1)
  const body = content.slice(bodyStart + 1, nextHeading < 0 ? content.length : nextHeading).trim()
  if (body.length === 0) throw new Error(`No release notes found for ${version}.`)
  return body + '\\n'
}'''
changelog_text, count = re.subn(
    r'export function extractReleaseNotes\(content, version\) \{.*?\n\}',
    lambda _match: replacement,
    changelog_text,
    count=1,
    flags=re.DOTALL,
)
if count != 1:
    raise SystemExit('extractReleaseNotes function anchor missing')
changelog_path.write_text(changelog_text)

artifact_path = Path('src/release/artifact-smoke.ts')
artifact_text = artifact_path.read_text()
old_bins = """    for (const bin of ['symbolwright', 'symbolwright-workspace', 'codemind', 'codemind-workspace']) {
      run(path.join(projectDir, 'node_modules', '.bin', bin), ['--help'], { cwd: projectDir })
    }
"""
new_bins = """    const binInvocations = [
      ['symbolwright', ['--help']],
      ['symbolwright-workspace', ['--json']],
      ['codemind', ['--help']],
      ['codemind-workspace', ['--json']],
    ] as const
    for (const [bin, args] of binInvocations) {
      run(path.join(projectDir, 'node_modules', '.bin', bin), args, { cwd: projectDir })
    }
"""
if old_bins not in artifact_text:
    raise SystemExit('Packed-bin invocation anchor missing')
artifact_path.write_text(artifact_text.replace(old_bins, new_bins, 1))

run(['npm', 'install', '--package-lock-only', '--ignore-scripts', '--silent'], quiet=True)
run(['npm', 'run', 'build', '--silent'], quiet=True)

os.environ['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE'] = '1'
script = """
const { runDockerSmoke } = require('./dist/release/artifact-smoke.js')
const result = runDockerSmoke(process.cwd())
console.log(JSON.stringify(result, null, 2))
if (result.status !== 'PASS') process.exit(1)
"""
result = subprocess.run(['node', '-e', script], check=False, env=os.environ.copy())
sys.exit(result.returncode)
