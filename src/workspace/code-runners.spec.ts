import { describe, expect, it } from 'vitest'

import {
  buildBrowserJavaScriptWorkerSource,
  buildHtmlPreviewDocument,
  runServerCode,
} from './code-runners.js'

describe('workspace code runners', () => {
  it('builds a browser JavaScript worker source with network wrappers disabled', () => {
    const workerSource = buildBrowserJavaScriptWorkerSource("console.log('ok')")

    expect(workerSource).toContain("console.log('ok')")
    expect(workerSource).toContain('const fetch = undefined')
    expect(workerSource).toContain('postMessage')
  })

  it('passes HTML through only as a preview document', () => {
    const html = '<h1>Preview</h1>'
    expect(buildHtmlPreviewDocument(html)).toBe(html)
  })

  it('runs TypeScript through the guarded server runner success path', async () => {
    const result = await runServerCode({
      languageId: 'typescript',
      code: `const value: number = 21 * 2
console.log(value)`,
    })

    expect(result.ok).toBe(true)
    expect(result.status).toBe('success')
    expect(result.output).toContain('42')
    expect(result.runnerId).toBe('server-typescript-node')
  })

  it('returns a syntax error for invalid TypeScript', async () => {
    const result = await runServerCode({
      languageId: 'typescript',
      code: 'const value: =',
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('syntax-error')
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('returns a runtime error without crashing the process', async () => {
    const result = await runServerCode({
      languageId: 'typescript',
      code: "throw new Error('boom')",
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('runtime-error')
    expect(result.errors.join('\n')).toContain('boom')
  })

  it('enforces a timeout', async () => {
    const result = await runServerCode({
      languageId: 'typescript',
      code: 'while (true) {}',
      timeoutMs: 100,
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('timeout')
  })

  it('does not run edit-only languages through the server runner', async () => {
    const result = await runServerCode({
      languageId: 'python',
      code: "print('nope')",
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('unsupported')
    expect(result.errors.join('\n')).toContain('edit-only')
  })
})
