import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const text = readFileSync(path, 'utf8')
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one occurrence, found ${count}`)
  writeFileSync(path, text.replace(before, after))
}

replaceOnce(
  'src/app/api/sandbox-routes.spec.ts',
  `import { SandboxHistoryStore } from '../../sandbox/sandbox-history.js'\n`,
  `import { SandboxHistoryStore } from '../../sandbox/sandbox-history.js'\nimport { STRONG_SANDBOX_NODE_IMAGE_ID } from '../../sandbox/sandbox-images.js'\n`,
)
replaceOnce(
  'src/app/api/sandbox-routes.spec.ts',
  `    expect(body.images.map((image) => image.id)).toContain('python-3-12-slim')\n`,
  `    expect(body.images.map((image) => image.id)).toContain(STRONG_SANDBOX_NODE_IMAGE_ID)\n`,
)
replaceOnce(
  'src/sandbox/sandbox-doctor.spec.ts',
  `    expect(rendered).toContain('never pulled automatically')\n`,
  `    expect(rendered).toContain('does not pull images automatically')\n`,
)
if (existsSync('sandbox-pr3-coverage-diagnostic.txt')) {
  rmSync('sandbox-pr3-coverage-diagnostic.txt')
}
rmSync('scripts/apply-sandbox-pr3-contract-cleanup.mjs')
