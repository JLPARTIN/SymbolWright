#!/usr/bin/env bash
set -euo pipefail

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
source = source.replace(
    "fs.rmSync(path.join(root, 'scripts/.bundle12-pr5-apply.mjs'), { force: true })",
    "// retained until connector cleanup",
)
source = source.replace(
    "fs.rmSync(path.join(root, '.github/workflows/bundle12-pr5-builder.yml'), { force: true })",
    "// retained until connector cleanup",
)
target.write_text(source)
PY

node scripts/.bundle12-pr5-apply.mjs

python3 - <<'PY'
from pathlib import Path
import re

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
        if before not in text:
            raise SystemExit(f'Missing fix anchor in {relative}: {before}')
        text = text.replace(before, after)
    path.write_text(text)

boot_path = Path('src/server/boot-sweep.ts')
boot = boot_path.read_text()
boot = boot.replace(
    "import { existsSync, readFileSync } from 'node:fs'",
    "import { existsSync, readFileSync, readdirSync } from 'node:fs'",
)
boot = boot.replace(
    "import { pruneAcquisitionRoot } from '../github/repository-acquisition-retention.js'",
    "import { resolveAcquisitionRoot } from '../github/repository-acquisition.js'\nimport {\n  pruneAcquisitionRoot,\n  resolveQuarantineRoot,\n} from '../github/repository-acquisition-retention.js'",
)
mission_pattern = re.compile(
    r"  try \{\n    let offset = 0.*?\n  \}\n\n  const sandboxIndex",
    re.DOTALL,
)
mission_replacement = """  try {
    const missionsRoot = options.missionService.getStore().getRootPath()
    const missionIndexPath = path.join(missionsRoot, 'index.json')
    let hasMissionRecords = existsSync(missionIndexPath)
    if (!hasMissionRecords) {
      try {
        hasMissionRecords = readdirSync(missionsRoot).some((entry) => entry !== 'index.json')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }

    if (hasMissionRecords) {
      let offset = 0
      const pageSize = 200
      for (;;) {
        const page = options.missionService.list({ offset, limit: pageSize })
        if (page.warnings.some((warning) => warning.code === 'CORRUPT_RECORD')) {
          missionStoreHealthy = false
        }
        for (const warning of page.warnings) warnings.push(warning.message)
        for (const mission of page.missions) {
          if (
            mission.status === 'ACTIVE' &&
            now().getTime() - new Date(mission.updatedAt).getTime() >=
              (options.staleActiveAfterMs ?? DEFAULT_STALE_ACTIVE_AFTER_MS)
          ) {
            staleActiveMissionIds.push(mission.id)
          }
        }
        offset += page.missions.length
        if (page.missions.length === 0 || offset >= page.total) break
      }
    }
  } catch (error) {
    missionStoreHealthy = false
    warnings.push(
      `Mission-store boot sweep failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const sandboxIndex"""
boot, mission_count = mission_pattern.subn(mission_replacement, boot)
if mission_count != 1:
    raise SystemExit(f'Expected one mission sweep block, replaced {mission_count}')
retention_before = """  let retention = { quarantined: 0, deleted: 0, restored: 0 }
  try {
    const result = await pruneAcquisitionRoot({
      workspaceRoot: options.workspaceRoot,
      missionService: options.missionService,
    })
    retention = {
      quarantined: result.quarantined.length,
      deleted: result.deleted.length,
      restored: result.restored.length,
    }
  } catch (error) {
    warnings.push(
      `External-repository retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
"""
retention_after = """  let retention = { quarantined: 0, deleted: 0, restored: 0 }
  const acquisitionRoot = resolveAcquisitionRoot(options.workspaceRoot)
  const quarantineRoot = resolveQuarantineRoot(options.workspaceRoot)
  if (existsSync(acquisitionRoot) || existsSync(quarantineRoot)) {
    try {
      const result = await pruneAcquisitionRoot({
        workspaceRoot: options.workspaceRoot,
        missionService: options.missionService,
      })
      retention = {
        quarantined: result.quarantined.length,
        deleted: result.deleted.length,
        restored: result.restored.length,
      }
    } catch (error) {
      warnings.push(
        `External-repository retention sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
"""
if retention_before not in boot:
    raise SystemExit('Missing retention sweep anchor')
boot_path.write_text(boot.replace(retention_before, retention_after))

Path('src/server/boot-sweep.spec.ts').write_text("""import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import { runBootSweep } from './boot-sweep.js'
import { ReadinessRegistry } from './readiness-registry.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('runBootSweep', () => {
  it('does not materialize mission or retention index files in a pristine workspace', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'symbolwright-boot-sweep-'))
    roots.push(workspaceRoot)
    const missionService = new MissionService({ workspaceRoot, env: {} })
    const readiness = new ReadinessRegistry()

    const report = await runBootSweep({ workspaceRoot, missionService, readiness })

    expect(report.missionStoreHealthy).toBe(true)
    expect(report.retention).toEqual({ quarantined: 0, deleted: 0, restored: 0 })
    expect(
      existsSync(path.join(workspaceRoot, '.symbolwright', 'missions', 'index.json')),
    ).toBe(false)
    expect(
      existsSync(path.join(workspaceRoot, '.symbolwright', 'external-repos-quarantine')),
    ).toBe(false)
  })
})
""")
PY

npx prettier --write \
  CHANGELOG.md \
  src/access/hosted-limit-policy.ts \
  src/access/hosted-limit-policy.spec.ts \
  src/app/api/access-routes.ts \
  src/app/server/unified-server.ts \
  src/cli-serve.ts \
  src/server/boot-sweep.ts \
  src/server/boot-sweep.spec.ts \
  src/server/deployment-mode.ts \
  src/server/deployment-mode.spec.ts \
  src/server/metrics-registry.ts \
  src/server/metrics-registry.spec.ts \
  src/server/operational-bootstrap.ts \
  src/server/readiness-registry.ts \
  src/server/readiness-registry.spec.ts \
  src/server/symbolwright-chat-server.ts \
  src/server/trusted-proxy.ts \
  src/server/trusted-proxy.spec.ts

npm run typecheck
npm run lint
npm run format:check
npm test
npm run build

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "fix(server): add network and operational hardening (Bundle #12 PR 5/7)"
git push origin "HEAD:${GITHUB_HEAD_REF}"
