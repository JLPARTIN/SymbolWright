import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_WEB_CONFIG,
  isWebMode,
  loadWebConfig,
  mergeWebConfig,
  WEB_MODES,
} from './web-config.js'

describe('isWebMode', () => {
  it('recognizes canonical modes', () => {
    for (const mode of WEB_MODES) {
      expect(isWebMode(mode)).toBe(true)
    }
  })

  it('rejects unknown modes', () => {
    expect(isWebMode('paranoid')).toBe(false)
  })
})

describe('mergeWebConfig', () => {
  it('is fully permissive-by-default with zero config', () => {
    const config = mergeWebConfig(undefined)
    expect(config).toEqual(DEFAULT_WEB_CONFIG)
    expect(config.enabled).toBe(true)
    expect(config.mode).toBe('developer')
    expect(config.fetch.allowPublicInternet).toBe(true)
    expect(config.fetch.allowPrivateNetwork).toBe(false)
    expect(config.search.enabled).toBe(true)
    expect(config.search.provider).toBe('duckduckgo')
  })

  it('merges partial overrides onto defaults', () => {
    const config = mergeWebConfig({ mode: 'strict', fetch: { allowedDomains: ['example.com'] } })

    expect(config.mode).toBe('strict')
    expect(config.fetch.allowedDomains).toEqual(['example.com'])
    // Untouched fetch fields keep their defaults.
    expect(config.fetch.timeoutMs).toBe(DEFAULT_WEB_CONFIG.fetch.timeoutMs)
    expect(config.fetch.maxBytes).toBe(DEFAULT_WEB_CONFIG.fetch.maxBytes)
  })

  it('lets an explicit allowPrivateNetwork override the default block', () => {
    const config = mergeWebConfig({ fetch: { allowPrivateNetwork: true } })
    expect(config.fetch.allowPrivateNetwork).toBe(true)
  })

  it('ignores malformed values and falls back to defaults', () => {
    const config = mergeWebConfig({
      enabled: 'yes',
      mode: 'not-a-real-mode',
      fetch: { timeoutMs: -5, allowedDomains: 'not-an-array' },
    })

    expect(config.enabled).toBe(DEFAULT_WEB_CONFIG.enabled)
    expect(config.mode).toBe(DEFAULT_WEB_CONFIG.mode)
    expect(config.fetch.timeoutMs).toBe(DEFAULT_WEB_CONFIG.fetch.timeoutMs)
    expect(config.fetch.allowedDomains).toEqual(DEFAULT_WEB_CONFIG.fetch.allowedDomains)
  })

  it('an env mode override takes precedence over the config file mode', () => {
    const config = mergeWebConfig({ mode: 'developer' }, 'strict')
    expect(config.mode).toBe('strict')
  })

  it('ignores an invalid env mode override', () => {
    const config = mergeWebConfig({ mode: 'ask' }, 'not-a-mode')
    expect(config.mode).toBe('ask')
  })
})

describe('loadWebConfig', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'symbolwright-web-config-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns full defaults when no config file exists', () => {
    expect(loadWebConfig(dir, { env: {} })).toEqual(DEFAULT_WEB_CONFIG)
  })

  it('reads the web section from .symbolwright/config.json', () => {
    mkdirSync(join(dir, '.symbolwright'), { recursive: true })
    writeFileSync(
      join(dir, '.symbolwright', 'config.json'),
      JSON.stringify({ web: { mode: 'off' } }),
    )

    expect(loadWebConfig(dir, { env: {} }).mode).toBe('off')
  })

  it('falls back to defaults on invalid JSON', () => {
    mkdirSync(join(dir, '.symbolwright'), { recursive: true })
    writeFileSync(join(dir, '.symbolwright', 'config.json'), '{not json')

    expect(loadWebConfig(dir, { env: {} })).toEqual(DEFAULT_WEB_CONFIG)
  })

  it('applies SYMBOLWRIGHT_WEB_MODE from the environment', () => {
    expect(loadWebConfig(dir, { env: { SYMBOLWRIGHT_WEB_MODE: 'ask' } }).mode).toBe('ask')
  })

  it('honors an explicit configPath override', () => {
    const explicitPath = join(dir, 'custom-config.json')
    writeFileSync(explicitPath, JSON.stringify({ web: { search: { enabled: false } } }))

    const config = loadWebConfig(dir, { configPath: explicitPath, env: {} })
    expect(config.search.enabled).toBe(false)
  })
})
