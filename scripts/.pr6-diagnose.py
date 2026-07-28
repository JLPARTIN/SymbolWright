from pathlib import Path
import json
import re
import subprocess
import sys


def run(args: list[str], *, stdout=None, stderr=None) -> int:
    return subprocess.run(args, check=False, stdout=stdout, stderr=stderr).returncode


if run(['npm', 'ci', '--silent']) != 0:
    raise SystemExit('npm ci failed')
if run(['python3', 'scripts/.pr6-preprocess.py']) != 0:
    raise SystemExit('preprocess failed')
if run(['python3', 'scripts/.pr6-apply.py']) != 0:
    raise SystemExit('apply failed')

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
test_path.write_text(test_text.replace(old_input, new_input, 1))

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

format_paths = [
    'src/autonomy/autonomous-budget-governance.spec.ts',
    'src/autonomy/autonomous-mission-coordinator.ts',
    'src/autonomy/autonomous-mission-runtime.ts',
    'src/autonomy/server-autonomy-runtime.ts',
    'src/orchestration/orchestration-money.spec.ts',
    'src/orchestration/orchestration-store.ts',
    'src/orchestration/orchestration-types.ts',
    'src/orchestration/team-service.ts',
    'src/app/api/mission-routes.ts',
    'src/server/symbolwright-chat-server.ts',
    'src/cli-release-readiness.ts',
    'src/cli-release-readiness.spec.ts',
    'src/release/artifact-smoke.ts',
]
with open('/tmp/prettier.log', 'w') as sink:
    if run(['npx', 'prettier', '--write', *format_paths], stdout=sink, stderr=sink) != 0:
        print(Path('/tmp/prettier.log').read_text())
        raise SystemExit('prettier failed')

with open('/tmp/vitest.log', 'w') as sink:
    status = run(
        ['npx', 'vitest', 'run', '--reporter=json', '--outputFile=/tmp/vitest.json'],
        stdout=sink,
        stderr=sink,
    )

result_path = Path('/tmp/vitest.json')
if not result_path.exists():
    print(Path('/tmp/vitest.log').read_text()[-12000:])
    raise SystemExit(status)

data = json.loads(result_path.read_text())
print(f"failed suites={data.get('numFailedTestSuites')} failed tests={data.get('numFailedTests')}")
for suite in data.get('testResults', []):
    if suite.get('status') != 'failed':
        continue
    print(f"FILE: {suite.get('name')}")
    if suite.get('message'):
        print(suite['message'])
    for assertion in suite.get('assertionResults', []):
        if assertion.get('status') == 'failed':
            print(f"TEST: {assertion.get('fullName') or assertion.get('title')}")
            for message in assertion.get('failureMessages', []):
                print(message)

sys.exit(status)
