import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const text = readFileSync(path, 'utf8')
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one occurrence, found ${count}`)
  writeFileSync(path, text.replace(before, after))
}

replaceOnce(
  'src/sandbox/sandbox-registry.spec.ts',
  `    expect(inventory.images[0]?.installed).toBeUndefined()\n`,
  `    expect(inventory.images[0]?.installed).toBe(false)\n`,
)
replaceOnce(
  'src/sandbox/sandbox-completion-coverage.spec.ts',
  `    expect(result.evidence.policyReason).toContain('No executable backend')\n`,
  `    expect(result.evidence.policyReason).toContain('immutable image configuration')\n`,
)
replaceOnce(
  'src/sandbox/sandbox-container-policy.ts',
  `      'The strong container backend is offline and never pulls images during execution.',\n`,
  `      'The strong container backend is offline and enforces --pull=never during execution.',\n`,
)
replaceOnce(
  'src/sandbox/sandbox-doctor.spec.ts',
  `    expect(rendered).toContain('does not pull images automatically')\n\n    const images = renderSandboxImagesReport(report)\n`,
  `    const images = renderSandboxImagesReport(report)\n`,
)
replaceOnce(
  'src/sandbox/sandbox-doctor.spec.ts',
  `    expect(images).toContain('Preparation commands are shown for operator review only')\n`,
  `    expect(images).toContain('Preparation commands are shown for operator review only')\n    expect(images).toContain('does not pull images automatically')\n`,
)
if (existsSync('sandbox-pr3-focused-diagnostic.txt')) rmSync('sandbox-pr3-focused-diagnostic.txt')
rmSync('scripts/apply-sandbox-pr3-focused-fixes.mjs')
