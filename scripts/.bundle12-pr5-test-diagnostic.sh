#!/usr/bin/env bash
set -euo pipefail

curl --fail --silent --show-error --location \
  "https://github.com/JLPARTIN/SymbolWright/archive/refs/heads/${GITHUB_HEAD_REF}.tar.gz" \
  | tar -xz --strip-components=1

python3 - <<'PY'
from pathlib import Path
import base64
import re

target = Path('scripts/.bundle12-pr5-apply.mjs')
source = target.read_text()
source, count = re.subn(
    r"String\.raw`(.*?)`(?=,\n\))",
    lambda match: "Buffer.from('" + base64.b64encode(match.group(1).encode()).decode() + "', 'base64').toString('utf8')",
    source,
    flags=re.DOTALL,
)
if count < 10:
    raise SystemExit(f'Expected at least 10 embedded source blocks, encoded {count}')
target.write_text(source)
PY

node scripts/.bundle12-pr5-apply.mjs

python3 - <<'PY'
from pathlib import Path

replacements = {
    'src/server/metrics-registry.spec.ts': [
        ("snapshot.counters.http_requests_total", "snapshot.counters['http_requests_total']"),
        ("snapshot.counters.http_responses_4xx_total", "snapshot.counters['http_responses_4xx_total']"),
        ("snapshot.counters.http_rate_or_concurrency_limited_total", "snapshot.counters['http_rate_or_concurrency_limited_total']"),
        ("snapshot.gauges.http_requests_active", "snapshot.gauges['http_requests_active']"),
    ],
    'src/server/readiness-registry.spec.ts': [
        ("checks.mission_store?.detail", "checks['mission_store']?.detail"),
    ],
    'src/server/trusted-proxy.ts': [
        ("return Array.isArray(value) ? value.join(',') : value", "return typeof value === 'string' ? value : value.join(',')"),
    ],
    'src/server/operational-bootstrap.ts': [
        (
            "new MissionService({ workspaceRoot, env: options.env })",
            "new MissionService({\n        workspaceRoot,\n        ...(options.env === undefined ? {} : { env: options.env }),\n      })",
        ),
    ],
    'src/app/server/unified-server.ts': [
        ("  buildChatServerWarnings,\n", ""),
    ],
}
for relative, pairs in replacements.items():
    path = Path(relative)
    text = path.read_text()
    for before, after in pairs:
        text = text.replace(before, after)
    path.write_text(text)
PY

npm ci --silent
npx prettier --write CHANGELOG.md src/access/hosted-limit-policy.ts src/access/hosted-limit-policy.spec.ts src/app/api/access-routes.ts src/app/server/unified-server.ts src/cli-serve.ts src/server/boot-sweep.ts src/server/deployment-mode.ts src/server/deployment-mode.spec.ts src/server/metrics-registry.ts src/server/metrics-registry.spec.ts src/server/operational-bootstrap.ts src/server/readiness-registry.ts src/server/readiness-registry.spec.ts src/server/symbolwright-chat-server.ts src/server/trusted-proxy.ts src/server/trusted-proxy.spec.ts --log-level silent

set +e
npx vitest run --reporter=json --outputFile=.vitest-results.json >/dev/null 2>&1
test_status=$?
set -e

node - <<'NODE'
const fs = require('node:fs')
const result = JSON.parse(fs.readFileSync('.vitest-results.json', 'utf8'))
console.log(`Failed suites: ${result.numFailedTestSuites ?? 0}; failed tests: ${result.numFailedTests ?? 0}`)
for (const suite of result.testResults ?? []) {
  const failed = (suite.assertionResults ?? []).filter((test) => test.status === 'failed')
  if (failed.length === 0 && suite.status !== 'failed') continue
  console.log(`\nFILE: ${suite.name}`)
  for (const test of failed) {
    console.log(`TEST: ${(test.ancestorTitles ?? []).concat(test.title ?? []).join(' > ')}`)
    for (const message of test.failureMessages ?? []) console.log(message)
  }
  if (failed.length === 0 && suite.message) console.log(suite.message)
}
NODE

exit "$test_status"
