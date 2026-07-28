import { readFileSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const text = readFileSync(path, 'utf8')
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one occurrence, found ${count}`)
  writeFileSync(path, text.replace(before, after))
}

replaceOnce(
  'src/sandbox/sandbox-completion-coverage.spec.ts',
  `import {
  assertContainerCommandPlanStaysNonExecutable,
  buildSandboxContainerCommandPlan,
} from './sandbox-container-command-plan.js'
`,
  `import {
  buildSandboxContainerCommandPlan,
  isSandboxContainerCommandPlanExecutable,
} from './sandbox-container-command-plan.js'
`,
)

replaceOnce(
  'src/sandbox/sandbox-completion-coverage.spec.ts',
  `const IMAGE = DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!
`,
  `const IMAGE = {
  ...DEFAULT_SANDBOX_IMAGE_ALLOWLIST[0]!,
  enabled: true,
  installed: true,
}
`,
)

const coveragePath = 'src/sandbox/sandbox-completion-coverage.spec.ts'
let coverage = readFileSync(coveragePath, 'utf8')
const plannerBlock = `
  it('covers executable container command planner safety branches without running containers', () => {
    const base = {
      image: IMAGE,
      engine: AVAILABLE_ENGINE,
      hostWorkspacePath: '/tmp/symbolwright-sandbox/workspace-coverage/input',
      hostOutputPath: '/tmp/symbolwright-sandbox/workspace-coverage/output',
      containerName: 'symbolwright-sandbox-coverage',
    } as const
    const plan = buildSandboxContainerCommandPlan({
      ...base,
      entrypoint: ['node', '/workspace/main.js'],
    })
    expect(plan.engine).toBe('podman')
    expect(plan.containerWorkspacePath).toBe('/workspace')
    expect(isSandboxContainerCommandPlanExecutable(plan)).toBe(true)

    expect(() => buildSandboxContainerCommandPlan({ ...base, entrypoint: [] })).toThrow(
      'requires an entrypoint',
    )
    expect(() =>
      buildSandboxContainerCommandPlan({ ...base, entrypoint: ['node', 'bad\\0arg'] }),
    ).toThrow('null-byte free')
    expect(() =>
      buildSandboxContainerCommandPlan({
        ...base,
        hostWorkspacePath: '/tmp/symbolwright-sandbox/bad\\0path',
        entrypoint: ['node', '/workspace/main.js'],
      }),
    ).toThrow('null bytes')
    expect(() =>
      buildSandboxContainerCommandPlan({
        ...base,
        hostWorkspacePath: '/',
        entrypoint: ['node', '/workspace/main.js'],
      }),
    ).toThrow('filesystem root')
    expect(() =>
      buildSandboxContainerCommandPlan({
        ...base,
        hostWorkspacePath: '/tmp/repo/.git/workspace',
        entrypoint: ['node', '/workspace/main.js'],
      }),
    ).toThrow('engine socket paths')
  })
})
`
const plannerPattern = /\n  it\('covers container command planner safety branches without executing containers',[\s\S]*?\n  \}\)\n\}\)\n$/
if (!plannerPattern.test(coverage)) throw new Error('container planner coverage block not found')
coverage = coverage.replace(plannerPattern, plannerBlock)
writeFileSync(coveragePath, coverage)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `      let stdout = Buffer.alloc(0)
      let stderr = Buffer.alloc(0)
`,
  `      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0)
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-command-plan.spec.ts',
  `        image: { ...IMAGE, image: 'node:latest', digest: undefined },
`,
  `        image: {
          id: IMAGE.id,
          image: 'node:latest',
          languages: IMAGE.languages,
          source: IMAGE.source,
          enabled: true,
          installed: true,
        },
`,
)
