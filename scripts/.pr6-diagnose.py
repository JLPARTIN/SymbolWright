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
artifact_text = artifact_text.replace(old_bins, new_bins, 1)
artifact_text = artifact_text.replace(
    "'-e', 'SYMBOLWRIGHT_HOST=0.0.0.0', '-e', 'SYMBOLWRIGHT_PORT=8787'",
    "'-e', 'SYMBOLWRIGHT_CHAT_HOST=0.0.0.0', '-e', 'SYMBOLWRIGHT_CHAT_PORT=8787'",
    1,
)
artifact_text = artifact_text.replace(
    "if (!commandExists('openssl')) throw new Error('openssl is required for hosted Docker smoke.')",
    "if (spawnSync('openssl', ['version'], { stdio: 'ignore' }).status !== 0) throw new Error('openssl is required for hosted Docker smoke.')",
    1,
)
openssl_anchor = """      run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-keyout', path.join(certs, 'key.pem'), '-out', path.join(certs, 'cert.pem'), '-days', '1'])
"""
openssl_replacement = openssl_anchor + """      run('chmod', ['0555', certs])
      run('chmod', ['0444', path.join(certs, 'key.pem'), path.join(certs, 'cert.pem')])
"""
if openssl_anchor not in artifact_text:
    raise SystemExit('OpenSSL fixture anchor missing')
artifact_text = artifact_text.replace(openssl_anchor, openssl_replacement, 1)
old_cleanup = """    if (run('docker', ['inspect', '-f', '{{.State.ExitCode}}', name]) !== '0') throw new Error('Container exited non-zero after SIGTERM.')
  } finally {
"""
new_cleanup = """    if (run('docker', ['inspect', '-f', '{{.State.ExitCode}}', name]) !== '0') throw new Error('Container exited non-zero after SIGTERM.')
  } catch (error) {
    const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' })
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${detail}\\nContainer logs:\\n${logs.stdout ?? ''}${logs.stderr ?? ''}`)
  } finally {
"""
if old_cleanup not in artifact_text:
    raise SystemExit('Docker cleanup anchor missing')
artifact_text = artifact_text.replace(old_cleanup, new_cleanup, 1)
volume_replacements = [
    (
        """  const state = mkdtempSync(path.join(tmpdir(), `symbolwright-${profile}-state-`))
  const certs = mkdtempSync(path.join(tmpdir(), `symbolwright-${profile}-certs-`))
""",
        """  const volume = `${name}-state`
  const certs = mkdtempSync(path.join(tmpdir(), `symbolwright-${profile}-certs-`))
""",
    ),
    (
        """    const mounts = ['-v', `${state}:/data`]
""",
        """    run('docker', ['volume', 'create', volume])
    const mounts = ['-v', `${volume}:/data`]
""",
    ),
    (
        """    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
    rmSync(state, { recursive: true, force: true }); rmSync(certs, { recursive: true, force: true })
""",
        """    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
    spawnSync('docker', ['volume', 'rm', '-f', volume], { stdio: 'ignore' })
    spawnSync('chmod', ['0700', certs], { stdio: 'ignore' })
    rmSync(certs, { recursive: true, force: true })
""",
    ),
]
for before, after in volume_replacements:
    if before not in artifact_text:
        raise SystemExit(f'Docker volume anchor missing: {before[:80]!r}')
    artifact_text = artifact_text.replace(before, after, 1)
artifact_path.write_text(artifact_text)

# The normal status API must remain a cheap diagnostic surface. Strict artifact execution stays the
# default for the release-readiness CLI, while the status collector opts into static gates only.
release_path = Path('src/cli-release-readiness.ts')
release_text = release_path.read_text()
release_before = """export function renderReleaseReadinessCommand(workspaceRoot: string): string {
  const report = assessReleaseReadiness(workspaceRoot, { runArtifactSmoke: true })
  return renderReleaseReadinessReport(report)
}
"""
release_after = """export function renderReleaseReadinessCommand(
  workspaceRoot: string,
  options: ReleaseReadinessOptions = { runArtifactSmoke: true },
): string {
  const report = assessReleaseReadiness(workspaceRoot, options)
  return renderReleaseReadinessReport(report)
}
"""
if release_before not in release_text:
    raise SystemExit('Release command options anchor missing')
release_path.write_text(release_text.replace(release_before, release_after, 1))

cli_path = Path('src/cli.ts')
cli_text = cli_path.read_text()
cli_before = """    case 'release-readiness':
      console.log(renderReleaseReadinessCommand(process.cwd()))
      break
"""
cli_after = """    case 'release-readiness':
      console.log(
        renderReleaseReadinessCommand(process.cwd(), {
          runArtifactSmoke: !rest.includes('--static'),
        }),
      )
      break
"""
if cli_before not in cli_text:
    raise SystemExit('Release-readiness CLI anchor missing')
cli_path.write_text(cli_text.replace(cli_before, cli_after, 1))

status_path = Path('src/web/status-runner.ts')
status_text = status_path.read_text()
status_replacements = [
    (
        "export function runScript(name: string, script: string): Promise<ScriptOutput> {",
        "export function runScript(\n  name: string,\n  script: string,\n  args: readonly string[] = [],\n): Promise<ScriptOutput> {",
    ),
    (
        "spawn(npmCommand, ['run', script, '--silent'], {",
        "spawn(npmCommand, ['run', script, '--silent', ...(args.length === 0 ? [] : ['--', ...args])], {",
    ),
    (
        "runScript('release-readiness', 'release-readiness'),",
        "runScript('release-readiness', 'release-readiness', ['--static']),",
    ),
]
for before, after in status_replacements:
    if before not in status_text:
        raise SystemExit(f'Status runner anchor missing: {before}')
    status_text = status_text.replace(before, after, 1)
status_path.write_text(status_text)

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
