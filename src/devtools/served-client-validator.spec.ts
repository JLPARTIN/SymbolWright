import { describe, expect, it } from 'vitest'

import { renderAppShellHtml } from '../app/shell/app-shell-html.js'
import { renderAgentViewHtml } from '../app/views/agent-view.js'
import { buildRepositoryViewClientScript } from '../app/views/repository-view.js'
import {
  classifyScriptBlock,
  extractScriptBlocks,
  validateScriptSyntax,
  validateServedHtml,
} from './served-client-validator.js'

const VALID_HTML = `<!doctype html>
<html>
<head><title>x</title></head>
<body>
  <script id="data" type="application/json">{"a": 1, "b": "</not-a-tag>"}</script>
  <script>function greet(name) { return 'hello, ' + name; }</script>
  <script src="/vendor/lib.js"></script>
</body>
</html>`

const INVALID_HTML = `<!doctype html>
<html>
<body>
  <script>
    const lines = ['a', 'b'];
    document.write(lines.join('
'));
  </script>
</body>
</html>`

describe('extractScriptBlocks', () => {
  it('extracts every script block in document order with its attributes and content', () => {
    const blocks = extractScriptBlocks(VALID_HTML)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]?.attributes['type']).toBe('application/json')
    expect(blocks[0]?.attributes['id']).toBe('data')
    expect(blocks[1]?.content).toContain('function greet')
    expect(blocks[2]?.attributes['src']).toBe('/vendor/lib.js')
  })

  it('stops a script block at the first </script, matching browser HTML parsing', () => {
    const html = `<script id="data" type="application/json">{"x":"<\\/script>"}</script><script>1;</script>`
    const blocks = extractScriptBlocks(html)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.content).toBe('{"x":"<\\/script>"}')
  })
})

describe('classifyScriptBlock', () => {
  it('classifies an untyped inline script as executable', () => {
    const [, executable] = extractScriptBlocks(VALID_HTML)
    expect(classifyScriptBlock(executable!)).toBe('executable')
  })

  it('excludes application/json script blocks from executable classification', () => {
    const [json] = extractScriptBlocks(VALID_HTML)
    expect(classifyScriptBlock(json!)).toBe('json')
  })

  it('classifies a script tag with a src attribute as external, not executable', () => {
    const [, , external] = extractScriptBlocks(VALID_HTML)
    expect(classifyScriptBlock(external!)).toBe('external')
  })
})

describe('validateScriptSyntax', () => {
  it('accepts valid generated client JavaScript', () => {
    const result = validateScriptSyntax("function greet(name) { return 'hello, ' + name; }")
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('detects invalid inline client JavaScript and reports the failing line', () => {
    const broken = "document.write(['a','b'].join('\n'));"
    const result = validateScriptSyntax(broken)
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.line).toBe(1)
    expect(result.nearbyLines?.some((line) => line.includes('document.write'))).toBe(true)
  })
})

describe('validateServedHtml', () => {
  it('reports executable and JSON counts and passes on fully valid HTML', () => {
    const result = validateServedHtml(VALID_HTML)
    expect(result.executableCount).toBe(1)
    expect(result.jsonCount).toBe(1)
    expect(result.allValid).toBe(true)
  })

  it('fails and identifies the broken script when a script contains a raw newline inside a string literal', () => {
    const result = validateServedHtml(INVALID_HTML)
    expect(result.allValid).toBe(false)
    const broken = result.scripts.find((script) => script.kind === 'executable')
    expect(broken?.syntax?.valid).toBe(false)
  })

  it('ignores JSON/data script blocks even when the HTML also has a broken executable script', () => {
    const html =
      `<script type="application/json">{"unterminated": "` +
      `not valid json but not JS either` +
      `"}</script>${INVALID_HTML}`
    const result = validateServedHtml(html)
    expect(result.jsonCount).toBe(1)
    expect(result.scripts[0]?.syntax).toBeUndefined()
  })
})

describe('served SymbolWright app shell regression coverage', () => {
  it('serves valid syntax for the Repository view client script (regression: nested \\n escaping)', () => {
    const wrapped = `<script>(function () {${buildRepositoryViewClientScript()}})();</script>`
    const result = validateServedHtml(wrapped)
    expect(result.executableCount).toBe(1)
    expect(result.allValid).toBe(true)
  })

  it('serves valid syntax for the Agent view mission bridge script (regression: nested \\n escaping)', () => {
    const html = renderAgentViewHtml()
    const result = validateServedHtml(html)
    expect(result.executableCount).toBeGreaterThan(0)
    expect(result.allValid).toBe(true)
  })

  it('serves a fully valid, unified app shell whose boot script reaches renderRoute()', () => {
    const html = renderAppShellHtml()
    const result = validateServedHtml(html)

    expect(result.executableCount).toBeGreaterThanOrEqual(4)
    expect(result.jsonCount).toBeGreaterThanOrEqual(1)
    expect(result.allValid).toBe(true)

    const bootScript = result.scripts.find((script) => script.content.includes('renderRoute();'))
    expect(bootScript).toBeDefined()
    expect(bootScript?.syntax?.valid).toBe(true)
  })

  it('exposes the client-side navigation functions the nav bar and views depend on', () => {
    const html = renderAppShellHtml()
    expect(html).toContain('function renderRoute()')
    expect(html).toContain('function navigateTo(viewId)')
    expect(html).toContain('function registerRouterViewInit(viewId, fn)')
    expect(html).toContain("window.addEventListener('hashchange', renderRoute)")
  })

  it('registers the Dashboard view initializer with the client router', () => {
    const html = renderAppShellHtml()
    expect(html).toContain("registerRouterViewInit('dashboard', loadDashboardStatus)")
  })
})
