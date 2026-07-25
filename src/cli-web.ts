import { loadWebConfig, isWebMode, type WebConfig } from './web/web-config.js'
import { performWebFetch } from './web/web-fetch.js'
import { renderWebFetchEvidence } from './runtime/tools/web-fetch-tool.js'
import { performWebSearch } from './web/web-search.js'
import { renderWebSearchEvidence } from './runtime/tools/web-search-tool.js'
import {
  createRuntimePolicyForMode,
  DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE,
} from './runtime/policy/runtime-policy.js'

interface ParsedWebFlags {
  readonly positionals: readonly string[]
  readonly configPath?: string
  readonly json: boolean
  readonly allowPrivate: boolean
  readonly modeOverride?: string
}

function parseWebFlags(args: readonly string[]): ParsedWebFlags {
  const positionals: string[] = []
  let configPath: string | undefined
  let json = false
  let allowPrivate = false
  let modeOverride: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--config') {
      configPath = args[++i]
      continue
    }
    if (arg === '--json') {
      json = true
      continue
    }
    if (arg === '--allow-private') {
      allowPrivate = true
      continue
    }
    if (arg === '--mode') {
      modeOverride = args[++i]
      continue
    }
    if (arg !== undefined) {
      positionals.push(arg)
    }
  }

  return {
    positionals,
    ...(configPath !== undefined ? { configPath } : {}),
    json,
    allowPrivate,
    ...(modeOverride !== undefined ? { modeOverride } : {}),
  }
}

function resolveWebConfig(cwd: string, flags: ParsedWebFlags): WebConfig {
  const base = loadWebConfig(cwd, {
    ...(flags.configPath !== undefined ? { configPath: flags.configPath } : {}),
  })

  if (flags.modeOverride === undefined && !flags.allowPrivate) {
    return base
  }

  if (flags.modeOverride !== undefined && !isWebMode(flags.modeOverride)) {
    throw new Error(
      `--mode must be one of developer, ask, strict, off (got "${flags.modeOverride}")`,
    )
  }

  return {
    ...base,
    ...(flags.modeOverride !== undefined ? { mode: flags.modeOverride } : {}),
    fetch: {
      ...base.fetch,
      ...(flags.allowPrivate ? { allowPrivateNetwork: true } : {}),
    },
  }
}

export async function renderWebFetchCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const flags = parseWebFlags(args)
  const url = flags.positionals[0]
  if (url === undefined) {
    throw new Error('Usage: codemind web fetch <url> [--json] [--allow-private] [--mode <mode>]')
  }

  const webConfig = resolveWebConfig(cwd, flags)
  const runtimePolicy = createRuntimePolicyForMode(DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE)

  const evidence = await performWebFetch({ url, webConfig, runtimePolicy })

  return flags.json ? JSON.stringify(evidence, null, 2) : renderWebFetchEvidence(evidence)
}

export async function renderWebSearchCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const flags = parseWebFlags(args)
  const query = flags.positionals.join(' ').trim()
  if (query.length === 0) {
    throw new Error('Usage: codemind web search "<query>" [--json] [--mode <mode>]')
  }

  const webConfig = resolveWebConfig(cwd, flags)
  const runtimePolicy = createRuntimePolicyForMode(DEFAULT_SYMBOLWRIGHT_RUNTIME_MODE)

  const evidence = await performWebSearch({ query, webConfig, runtimePolicy })

  return flags.json ? JSON.stringify(evidence, null, 2) : renderWebSearchEvidence(evidence)
}
