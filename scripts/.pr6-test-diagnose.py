from pathlib import Path
import json
import subprocess
import sys

result_path = Path('/tmp/vitest.json')
log_path = Path('/tmp/vitest.log')
with log_path.open('w') as sink:
    status = subprocess.run(
        ['npx', 'vitest', 'run', '--reporter=json', '--outputFile=/tmp/vitest.json'],
        check=False,
        stdout=sink,
        stderr=sink,
    ).returncode

if not result_path.exists():
    print(log_path.read_text()[-12000:])
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
