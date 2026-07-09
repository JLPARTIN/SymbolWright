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

  it('does not route browser-only Python through the server runner', async () => {
    const result = await runServerCode({
      languageId: 'python',
      code: "print('nope')",
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('unsupported')
    expect(result.errors.join('\n')).toContain('not handled by the server runner')
  })

  it('returns unsupported for an unknown language id without a runner', async () => {
    const result = await runServerCode({
      languageId: 'brainfuck',
      code: '++++',
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('unsupported')
    expect(result.capability).toBe('not-yet-supported')
    expect(result.errors.join('\n')).toContain('Unsupported language id')
  })

  it('rejects oversized code before creating a runtime execution result', async () => {
    const result = await runServerCode({
      languageId: 'typescript',
      code: `console.log('${'x'.repeat(65_000)}')`,
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe('unsupported')
    expect(result.errors.join('\n')).toContain('Code input is too large')
  })

  it('truncates large output through the configured output cap', async () => {
    const result = await runServerCode({
      languageId: 'typescript',
      code: `console.log('${'x'.repeat(2_000)}')`,
      maxOutputBytes: 1_024,
    })

    expect(result.ok).toBe(true)
    expect(result.status).toBe('success')
    expect(result.output).toContain('[output truncated at 1024 bytes]')
  })

  it('falls back to string conversion for circular console values', async () => {
    const result = await runServerCode({
      languageId: 'typescript',
      code: `const value: Record<string, unknown> = {}
value['self'] = value
console.log(value)`,
    })

    expect(result.ok).toBe(true)
    expect(result.output).toContain('[object Object]')
  })
})
