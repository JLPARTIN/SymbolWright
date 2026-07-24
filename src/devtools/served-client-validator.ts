import vm from 'node:vm'

/**
 * Parses `<script>` tags out of served HTML and syntax-checks the executable
 * ones with the real V8 parser (`node:vm`), so a page that type-checks in
 * TypeScript but emits broken inline browser JavaScript (e.g. an unescaped
 * newline landing inside a single-quoted string once a template literal is
 * nested one level too deep) fails loudly instead of shipping silently.
 */

export type ScriptKind = 'executable' | 'json' | 'external' | 'other-data'

export interface ExtractedScriptBlock {
  readonly index: number
  readonly attributes: Readonly<Record<string, string>>
  readonly content: string
  readonly startOffset: number
  readonly endOffset: number
}

export interface ScriptSyntaxResult {
  readonly valid: boolean
  readonly error?: string
  readonly line?: number
  readonly nearbyLines?: readonly string[]
}

export interface ServedScriptReport extends ExtractedScriptBlock {
  readonly kind: ScriptKind
  readonly syntax?: ScriptSyntaxResult
}

export interface ServedHtmlValidationResult {
  readonly scripts: readonly ServedScriptReport[]
  readonly executableCount: number
  readonly jsonCount: number
  readonly allValid: boolean
}

const SCRIPT_OPEN_TAG = /<script\b([^>]*)>/gi
const ATTRIBUTE_PATTERN =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'=<>`]+))?/g

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  let match: RegExpExecArray | null
  ATTRIBUTE_PATTERN.lastIndex = 0
  while ((match = ATTRIBUTE_PATTERN.exec(raw)) !== null) {
    const name = match[1]?.toLowerCase()
    if (name === undefined) continue
    attributes[name] = match[3] ?? match[4] ?? match[2] ?? ''
  }
  return attributes
}

/** Extracts every `<script>` block from served HTML, in document order. */
export function extractScriptBlocks(html: string): readonly ExtractedScriptBlock[] {
  const blocks: ExtractedScriptBlock[] = []
  const lowerHtml = html.toLowerCase()
  let match: RegExpExecArray | null
  let index = 0
  SCRIPT_OPEN_TAG.lastIndex = 0

  while ((match = SCRIPT_OPEN_TAG.exec(html)) !== null) {
    const attributes = parseAttributes(match[1] ?? '')
    const contentStart = match.index + match[0].length
    const closeIndex = lowerHtml.indexOf('</script', contentStart)
    if (closeIndex === -1) {
      break
    }

    blocks.push({
      index: index++,
      attributes,
      content: html.slice(contentStart, closeIndex),
      startOffset: contentStart,
      endOffset: closeIndex,
    })
    SCRIPT_OPEN_TAG.lastIndex = closeIndex
  }

  return blocks
}

/** Classifies a script block as executable JS, a JSON/data payload, external, or other data. */
export function classifyScriptBlock(block: Pick<ExtractedScriptBlock, 'attributes'>): ScriptKind {
  if (block.attributes['src'] !== undefined) {
    return 'external'
  }

  const type = (block.attributes['type'] ?? '').toLowerCase().trim()
  if (
    type === '' ||
    type === 'text/javascript' ||
    type === 'application/javascript' ||
    type === 'module'
  ) {
    return 'executable'
  }

  if (type.endsWith('+json') || type === 'application/json' || type === 'importmap') {
    return 'json'
  }

  return 'other-data'
}

const SYNTAX_ERROR_LOCATION = /^served-client\.js:(\d+)/

function nearbyLines(code: string, line: number, context = 3): readonly string[] {
  const lines = code.split('\n')
  const start = Math.max(0, line - 1 - context)
  const end = Math.min(lines.length, line + context)
  return lines.slice(start, end).map((text, offset) => `${start + offset + 1}: ${text}`)
}

/** Syntax-checks browser JavaScript with the real V8 parser, without executing it. */
export function validateScriptSyntax(code: string): ScriptSyntaxResult {
  try {
    new vm.Script(code, { filename: 'served-client.js' })
    return { valid: true }
  } catch (error) {
    const err = error as Error
    const locationMatch = SYNTAX_ERROR_LOCATION.exec(err.stack ?? '')
    const line =
      locationMatch?.[1] === undefined ? undefined : Number.parseInt(locationMatch[1], 10)

    return {
      valid: false,
      error: err.message,
      ...(line === undefined ? {} : { line, nearbyLines: nearbyLines(code, line) }),
    }
  }
}

/** Extracts, classifies, and syntax-checks every script block in served HTML. */
export function validateServedHtml(html: string): ServedHtmlValidationResult {
  const scripts: ServedScriptReport[] = extractScriptBlocks(html).map((block) => {
    const kind = classifyScriptBlock(block)
    if (kind !== 'executable') {
      return { ...block, kind }
    }
    return { ...block, kind, syntax: validateScriptSyntax(block.content) }
  })

  const executableCount = scripts.filter((script) => script.kind === 'executable').length
  const jsonCount = scripts.filter((script) => script.kind === 'json').length
  const allValid = scripts.every(
    (script) => script.kind !== 'executable' || script.syntax?.valid === true,
  )

  return { scripts, executableCount, jsonCount, allValid }
}
