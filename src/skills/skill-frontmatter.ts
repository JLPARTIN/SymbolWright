import { ALL_SYMBOLWRIGHT_TOOL_NAMES, type SymbolWrightToolName } from '../runtime/types.js'
import { isSubagentName, type SubagentName } from '../hivemind/subagent-definitions.js'
import type { SkillContext, SkillFrontmatter, SkillShell } from './skill-types.js'

interface ParsedSkillMarkdown {
  readonly frontmatter: SkillFrontmatter
  readonly rawFrontmatter: Readonly<Record<string, unknown>>
  readonly body: string
}

const ARRAY_FIELDS = new Set([
  'arguments',
  'allowed-tools',
  'allowed_tools',
  'allowedTools',
  'disallowed-tools',
  'disallowed_tools',
  'disallowedTools',
  'paths',
])

function firstParagraph(markdown: string): string {
  return (
    markdown
      .split(/\n\s*\n/u)[0]
      ?.replace(/^#+\s*/u, '')
      .trim()
      .slice(0, 300) ?? ''
  )
}

function normalizeKey(key: string): string {
  switch (key) {
    case 'when_to_use':
    case 'when-to-use':
      return 'whenToUse'
    case 'argument-hint':
    case 'argument_hint':
      return 'argumentHint'
    case 'disable-model-invocation':
    case 'disable_model_invocation':
      return 'disableModelInvocation'
    case 'user-invocable':
    case 'user_invocable':
      return 'userInvocable'
    case 'allowed-tools':
    case 'allowed_tools':
      return 'allowedTools'
    case 'disallowed-tools':
    case 'disallowed_tools':
      return 'disallowedTools'
    default:
      return key
  }
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseScalar(rawValue: string, isArrayField: boolean = false): unknown {
  const value = stripQuotes(rawValue)
  if (value === 'true') return true
  if (value === 'false') return false
  if (isArrayField && value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => stripQuotes(item))
      .filter((item) => item.length > 0)
  }
  return value
}

function parseArrayValue(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0)
  }

  if (typeof value === 'string') {
    return value
      .split(/[\s,]+/u)
      .map((item) => stripQuotes(item))
      .filter((item) => item.length > 0)
  }

  return []
}

function parseFrontmatterBlock(block: string): Readonly<Record<string, unknown>> {
  const raw: Record<string, unknown> = {}
  let currentListKey: string | undefined

  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/u, '')
    if (line.trim().length === 0 || line.trim().startsWith('#')) continue

    const listMatch = /^\s*-\s+(.+)$/u.exec(line)
    if (listMatch !== null && currentListKey !== undefined) {
      const existing = raw[currentListKey]
      const values = Array.isArray(existing) ? existing : []
      raw[currentListKey] = [...values, stripQuotes(listMatch[1] ?? '')]
      continue
    }

    const keyValueMatch = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/u.exec(line)
    if (keyValueMatch === null) {
      throw new Error(`Invalid skill frontmatter line: ${line}`)
    }

    const rawKey = keyValueMatch[1] ?? ''
    const normalizedKey = normalizeKey(rawKey)
    const value = keyValueMatch[2] ?? ''
    const isArrayField = ARRAY_FIELDS.has(rawKey) || ARRAY_FIELDS.has(normalizedKey)

    if (value.trim().length === 0 && isArrayField) {
      raw[normalizedKey] = []
      currentListKey = normalizedKey
      continue
    }

    raw[normalizedKey] = parseScalar(value, isArrayField)
    currentListKey = undefined
  }

  return raw
}

function parseToolNames(value: unknown, field: string): readonly SymbolWrightToolName[] {
  const validTools = new Set<string>(ALL_SYMBOLWRIGHT_TOOL_NAMES)
  return parseArrayValue(value).map((tool) => {
    if (!validTools.has(tool)) {
      throw new Error(`Unknown tool in skill ${field}: ${tool}`)
    }
    return tool as SymbolWrightToolName
  })
}

function parseContext(value: unknown): SkillContext | undefined {
  if (value === undefined) return undefined
  if (value === 'inline' || value === 'fork') return value
  throw new Error(`Invalid skill context: ${String(value)}. Expected inline or fork.`)
}

function parseShell(value: unknown): SkillShell | undefined {
  if (value === undefined) return undefined
  if (value === 'bash' || value === 'powershell') return value
  throw new Error(`Invalid skill shell: ${String(value)}. Expected bash or powershell.`)
}

function parseAgent(value: unknown): SubagentName | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error('Skill agent must be a string.')
  if (!isSubagentName(value)) {
    throw new Error(`Invalid skill agent: ${value}. Expected explorer, reviewer, or test-planner.`)
  }
  return value
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  throw new Error(`Expected boolean skill frontmatter value, got: ${String(value)}`)
}

function parseOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`Skill ${field} must be a string.`)
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeFrontmatter(raw: Readonly<Record<string, unknown>>): SkillFrontmatter {
  const name = parseOptionalString(raw['name'], 'name')
  const description = parseOptionalString(raw['description'], 'description')
  const whenToUse = parseOptionalString(raw['whenToUse'], 'when_to_use')
  const argumentHint = parseOptionalString(raw['argumentHint'], 'argument-hint')
  const context = parseContext(raw['context'])
  const agent = parseAgent(raw['agent'])
  const shell = parseShell(raw['shell'])
  const allowedTools = parseToolNames(raw['allowedTools'], 'allowed-tools')
  const disallowedTools = parseToolNames(raw['disallowedTools'], 'disallowed-tools')
  const argumentsList = parseArrayValue(raw['arguments'])
  const paths = parseArrayValue(raw['paths'])

  return {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(whenToUse !== undefined ? { whenToUse } : {}),
    ...(argumentHint !== undefined ? { argumentHint } : {}),
    ...(argumentsList.length > 0 ? { arguments: argumentsList } : {}),
    disableModelInvocation: parseBoolean(raw['disableModelInvocation'], false),
    userInvocable: parseBoolean(raw['userInvocable'], true),
    ...(allowedTools.length > 0 ? { allowedTools } : {}),
    ...(disallowedTools.length > 0 ? { disallowedTools } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(agent !== undefined ? { agent } : {}),
    ...(paths.length > 0 ? { paths } : {}),
    ...(shell !== undefined ? { shell } : {}),
  }
}

export function parseSkillMarkdown(markdown: string): ParsedSkillMarkdown {
  if (!markdown.startsWith('---')) {
    const description = firstParagraph(markdown)
    return {
      frontmatter: description.length > 0 ? { description } : {},
      rawFrontmatter: {},
      body: markdown.trim(),
    }
  }

  const closing = markdown.indexOf('\n---', 3)
  if (closing === -1) {
    throw new Error('Skill frontmatter is missing closing --- marker.')
  }

  const block = markdown.slice(3, closing).trim()
  const body = markdown.slice(closing + '\n---'.length).trim()
  const rawFrontmatter = parseFrontmatterBlock(block)
  const frontmatter = normalizeFrontmatter(rawFrontmatter)

  if (frontmatter.description === undefined) {
    const fallback = firstParagraph(body)
    return {
      frontmatter: fallback.length > 0 ? { ...frontmatter, description: fallback } : frontmatter,
      rawFrontmatter,
      body,
    }
  }

  return { frontmatter, rawFrontmatter, body }
}
