import { describe, expect, it } from 'vitest'

import { buildSandboxInventory, runnerAvailability } from './sandbox-registry.js'
import { SandboxService } from './sandbox-service.js'
import type { SandboxRunnerAvailability } from './sandbox-types.js'

const CHECKED_AT = '2026-07-21T00:00:00.000Z'

function availability(command: string, version = `${command} test`): SandboxRunnerAvailability {
  return runnerAvailability('available', CHECKED_AT, { version })
}

function createValidationService(env: NodeJS.ProcessEnv = { PATH: process.env['PATH'] ?? '' }) {
  return new SandboxService({
    env,
    now: () => new Date(CHECKED_AT),
    generateExecutionId: () => 'sandbox_validation_coverage',
    inventory: buildSandboxInventory({
      env,
      commandAvailability: new Map([['node', availability('node')]]),
      now: () => new Date(CHECKED_AT),
    }),
  })
}

describe('sandbox validation coverage', () => {
  it('covers invalid request-shape branches', () => {
    const service = createValidationService()

    const invalidPayloads: readonly unknown[] = [
      null,
      {},
      { languageId: 'not-a-language', mode: 'run', source: 'x' },
      { languageId: 'javascript', mode: 'execute', source: 'x' },
      { languageId: 'javascript', mode: 'run' },
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'x',
        files: [{ path: 'main.js', content: 'x' }],
      },
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'x',
        repository: { rootPath: '/tmp/repo', selectedPaths: ['main.js'] },
      },
      {
        languageId: 'javascript',
        mode: 'run',
        files: [{ path: '../escape.js', content: 'x' }],
      },
      {
        languageId: 'javascript',
        mode: 'run',
        files: [{ path: '/absolute.js', content: 'x' }],
      },
      {
        languageId: 'javascript',
        mode: 'run',
        files: [{ path: 'bad\0name.js', content: 'x' }],
      },
      {
        languageId: 'javascript',
        mode: 'run',
        files: [
          { path: 'same.js', content: '1' },
          { path: 'same.js', content: '2' },
        ],
      },
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'x',
        stdin: 'x'.repeat(100_000),
      },
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'x',
        args: Array.from({ length: 100 }, (_, index) => String(index)),
      },
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'x',
        args: ['x'.repeat(10_000)],
      },
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'x',
        requestedRunnerId: '../bad-runner',
      },
    ]

    for (const payload of invalidPayloads) {
      expect(() => service.validateRequest(payload)).toThrow()
    }
  })

  it('covers valid file-bundle and repository request branches', () => {
    const service = createValidationService()

    const fileBundle = service.validateRequest({
      languageId: 'javascript',
      mode: 'run',
      files: [
        { path: 'README.md', content: 'not the entry' },
        { path: 'src/main.js', content: "console.log('ok')" },
      ],
      args: ['--safe'],
      stdin: 'input',
    })

    expect(fileBundle.files?.[1]?.path).toBe('src/main.js')
    expect(fileBundle.args).toEqual(['--safe'])
    expect(fileBundle.stdin).toBe('input')

    const repositoryTarget = service.validateRequest({
      languageId: 'javascript',
      mode: 'test',
      repository: {
        rootPath: '/tmp/codemind-validation-repo',
        selectedPaths: ['src/main.js'],
      },
      requestedRunnerId: 'guarded-host-javascript',
    })

    expect(repositoryTarget.repository?.selectedPaths?.[0]).toBe('src/main.js')
    expect(repositoryTarget.requestedRunnerId).toBe('guarded-host-javascript')
  })

  it('covers policy-blocked execution branches', async () => {
    const noOptIn = createValidationService({ PATH: process.env['PATH'] ?? '' })

    const approvedButNoHostOptIn = await noOptIn.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        source: "console.log('blocked')",
        requestedRunnerId: 'guarded-host-javascript',
      },
      { mode: 'APPROVED_EXECUTION' },
    )

    expect(approvedButNoHostOptIn.status).toBe('policy-blocked')
    expect(approvedButNoHostOptIn.evidence.policyDecision).toBe('blocked')

    const optedIn = createValidationService({
      PATH: process.env['PATH'] ?? '',
      CODEMIND_ALLOW_GUARDED_HOST_EXECUTION: 'true',
    })

    const readOnly = await optedIn.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        source: "console.log('blocked')",
        requestedRunnerId: 'guarded-host-javascript',
      },
      { mode: 'READ_ONLY' },
    )

    expect(readOnly.status).toBe('policy-blocked')
    expect(readOnly.evidence.policyDecision).toBe('blocked')

    const proposalOnly = await optedIn.execute(
      {
        languageId: 'javascript',
        mode: 'run',
        source: "console.log('blocked')",
        requestedRunnerId: 'guarded-host-javascript',
      },
      { mode: 'PROPOSAL_ONLY' },
    )

    expect(proposalOnly.status).toBe('policy-blocked')
    expect(proposalOnly.evidence.policyDecision).toBe('blocked')
  })
})
