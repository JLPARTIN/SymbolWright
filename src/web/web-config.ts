import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { readEnvWithLegacyFallback } from '../config/env-compat.js'

/**
 * developer — default; public web works immediately, no allowlist/approval required.
 * ask       — public web allowed, but each call needs an approval ticket with the web:access scope.
 * strict    — allowlist-only; nothing is reachable until allowedDomains is set.
 * off       — web_fetch and web_search are both disabled.
 */
export type WebMode = 'developer' | 'ask' | 'strict' | 'off'

export const WEB_MODES: readonly WebMode[] = ['developer', 'ask', 'strict', 'off'] as const

export function isWebMode(value: string): value is WebMode {
  return (WEB_MODES as readonly string[]).includes(value)
}

export interface WebFetchConfig {
  readonly enabled: boolean
  readonly timeoutMs: number
  readonly maxBytes: number
  readonly maxRedirects: number
  readonly allowPublicInternet: boolean
  readonly allowPrivateNetwork: boolean
  readonly allowedDomains: readonly string[]
  readonly deniedDomains: readonly string[]
  readonly allowedContentTypes: readonly string[]
}

export interface WebSearchConfig {
  readonly enabled: boolean
  readonly provider: string
  readonly maxResults: number
  readonly timeoutMs: number
}

export interface WebConfig {
  readonly enabled: boolean
  readonly mode: WebMode
  readonly requireApproval: boolean
  readonly fetch: WebFetchConfig
  readonly search: WebSearchConfig
  readonly redaction: boolean
}

export const DEFAULT_WEB_CONFIG: WebConfig = {
  enabled: true,
  mode: 'developer',
  requireApproval: false,
  fetch: {
    enabled: true,
    timeoutMs: 10_000,
    maxBytes: 2_000_000,
    maxRedirects: 5,
    allowPublicInternet: true,
    allowPrivateNetwork: false,
    allowedDomains: [],
    deniedDomains: [],
    allowedContentTypes: [
      'text/html',
      'text/plain',
      'text/markdown',
      'application/json',
      'application/xml',
    ],
  },
  search: {
    enabled: true,
    provider: 'duckduckgo',
    maxResults: 8,
    timeoutMs: 10_000,
  },
  redaction: true,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) return fallback
  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : fallback
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function mergeFetchConfig(raw: unknown): WebFetchConfig {
  const base = DEFAULT_WEB_CONFIG.fetch
  if (!isRecord(raw)) return base

  return {
    enabled: bool(raw['enabled'], base.enabled),
    timeoutMs: positiveNumber(raw['timeoutMs'], base.timeoutMs),
    maxBytes: positiveNumber(raw['maxBytes'], base.maxBytes),
    maxRedirects: positiveNumber(raw['maxRedirects'], base.maxRedirects),
    allowPublicInternet: bool(raw['allowPublicInternet'], base.allowPublicInternet),
    allowPrivateNetwork: bool(raw['allowPrivateNetwork'], base.allowPrivateNetwork),
    allowedDomains: stringArray(raw['allowedDomains'], base.allowedDomains),
    deniedDomains: stringArray(raw['deniedDomains'], base.deniedDomains),
    allowedContentTypes: stringArray(raw['allowedContentTypes'], base.allowedContentTypes),
  }
}

function mergeSearchConfig(raw: unknown): WebSearchConfig {
  const base = DEFAULT_WEB_CONFIG.search
  if (!isRecord(raw)) return base

  return {
    enabled: bool(raw['enabled'], base.enabled),
    provider:
      typeof raw['provider'] === 'string' && raw['provider'].trim().length > 0
        ? raw['provider']
        : base.provider,
    maxResults: positiveNumber(raw['maxResults'], base.maxResults),
    timeoutMs: positiveNumber(raw['timeoutMs'], base.timeoutMs),
  }
}

/** Merges a raw, untrusted `web` config object onto the documented defaults. */
export function mergeWebConfig(raw: unknown, envMode?: string): WebConfig {
  const root = isRecord(raw) ? raw : {}

  const envModeNormalized =
    typeof envMode === 'string' && isWebMode(envMode.trim().toLowerCase())
      ? (envMode.trim().toLowerCase() as WebMode)
      : undefined

  const rawMode = typeof root['mode'] === 'string' ? root['mode'] : undefined
  const mode =
    envModeNormalized ??
    (rawMode !== undefined && isWebMode(rawMode) ? rawMode : DEFAULT_WEB_CONFIG.mode)

  return {
    enabled: bool(root['enabled'], DEFAULT_WEB_CONFIG.enabled),
    mode,
    requireApproval: bool(root['requireApproval'], DEFAULT_WEB_CONFIG.requireApproval),
    fetch: mergeFetchConfig(root['fetch']),
    search: mergeSearchConfig(root['search']),
    redaction: bool(root['redaction'], DEFAULT_WEB_CONFIG.redaction),
  }
}

/**
 * Loads the `web` section of `.symbolwright/config.json`. Missing file, missing
 * `web` key, or unparsable JSON all fall back to documented defaults --
 * web access works out of the box with zero setup.
 */
export function loadWebConfig(
  workspaceRoot: string,
  options: { readonly configPath?: string; readonly env?: NodeJS.ProcessEnv } = {},
): WebConfig {
  const configPath = options.configPath ?? join(workspaceRoot, '.symbolwright', 'config.json')
  const env = options.env ?? process.env

  let rawWeb: unknown
  if (existsSync(configPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf-8'))
      rawWeb = isRecord(parsed) ? parsed['web'] : undefined
    } catch {
      rawWeb = undefined
    }
  }

  return mergeWebConfig(
    rawWeb,
    readEnvWithLegacyFallback('SYMBOLWRIGHT_WEB_MODE', 'CODEMIND_WEB_MODE', { env }),
  )
}
