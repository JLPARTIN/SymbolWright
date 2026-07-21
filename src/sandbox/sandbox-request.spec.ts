import { describe, expect, it } from 'vitest'

import { normalizeSandboxLimits } from './sandbox-limits.js'
import {
  SandboxRequestValidationError,
  validateSandboxExecutionRequest,
} from './sandbox-request.js'

const OPTIONS = {
  knownLanguageIds: ['javascript', 'python', 'rust'],
  knownRunnerIds: ['browser-javascript', 'guarded-host-python'],
}

describe('sandbox request validation', () => {
  it('accepts one snippet source mode and clamps browser-provided limits', () => {
    const request = validateSandboxExecutionRequest(
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'console.log("hello")',
        stdin: 'input',
        args: ['--safe'],
        limits: { timeoutMs: 999_999, maxFiles: 999_999 },
        requestedRunnerId: 'browser-javascript',
      },
      OPTIONS,
    )

    expect(request.languageId).toBe('javascript')
    expect(request.limits?.timeoutMs).toBe(10_000)
    expect(request.limits?.maxFiles).toBe(32)
  })

  it('rejects ambiguous, unknown, traversal, absolute, duplicate, and oversized inputs', () => {
    for (const raw of [
      null,
      { languageId: 'unknown', mode: 'run', source: 'x' },
      { languageId: 'javascript', mode: 'bad', source: 'x' },
      { languageId: 'javascript', mode: 'run', source: 'x', files: [] },
      { languageId: 'javascript', mode: 'run' },
      { languageId: 'javascript', mode: 'run', requestedRunnerId: 'missing', source: 'x' },
      { languageId: 'javascript', mode: 'run', files: [{ path: '../secret.js', content: 'x' }] },
      { languageId: 'javascript', mode: 'run', files: [{ path: '/secret.js', content: 'x' }] },
      {
        languageId: 'javascript',
        mode: 'run',
        files: [
          { path: 'a.js', content: 'x' },
          { path: './a.js', content: 'x' },
        ],
      },
      { languageId: 'javascript', mode: 'run', source: 'x'.repeat(512_001) },
      { languageId: 'javascript', mode: 'run', source: 'x', stdin: 'x'.repeat(64_001) },
      {
        languageId: 'javascript',
        mode: 'run',
        source: 'x',
        args: Array.from({ length: 33 }, () => 'a'),
      },
      { languageId: 'javascript', mode: 'run', source: 'x', args: ['x'.repeat(4_001)] },
      { languageId: 'javascript\0', mode: 'run', source: 'x' },
    ]) {
      expect(() => validateSandboxExecutionRequest(raw, OPTIONS)).toThrow(
        SandboxRequestValidationError,
      )
    }
  })

  it('accepts file bundles and repository targets only inside declared boundaries', () => {
    const files = validateSandboxExecutionRequest(
      {
        languageId: 'python',
        mode: 'run',
        files: [{ path: 'src/main.py', content: 'print(1)' }],
      },
      OPTIONS,
    )
    expect(files.files?.[0]?.path).toBe('src/main.py')

    const repository = validateSandboxExecutionRequest(
      {
        languageId: 'rust',
        mode: 'test',
        repository: { rootPath: '/repo', selectedPaths: ['src/lib.rs'] },
      },
      OPTIONS,
    )
    expect(repository.repository?.selectedPaths).toEqual(['src/lib.rs'])
  })
})

describe('sandbox limit normalization', () => {
  it('only lets request limits reduce risk', () => {
    expect(normalizeSandboxLimits({ timeoutMs: 1 }).timeoutMs).toBe(1)
    expect(normalizeSandboxLimits({ timeoutMs: 999_999 }).timeoutMs).toBe(10_000)
    expect(normalizeSandboxLimits({ timeoutMs: -1 }).timeoutMs).toBe(10_000)
  })
})
