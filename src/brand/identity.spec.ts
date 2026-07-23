import { describe, expect, it } from 'vitest'

import {
  CODETELLIGENCE_PLATFORM_NAME,
  codetelligenceEnvironmentVariable,
  legacyCodeMindEnvironmentVariable,
  readBrandEnvironmentValue,
  renderLegacyEnvironmentWarning,
} from './identity.js'

describe('Codetelligence brand identity', () => {
  it('declares Codetelligence as the canonical platform', () => {
    expect(CODETELLIGENCE_PLATFORM_NAME).toBe('Codetelligence')
  })

  it('prefers canonical environment variables over legacy values', () => {
    expect(
      readBrandEnvironmentValue(
        {
          CODETELLIGENCE_API_KEY: 'new-key',
          CODEMIND_API_KEY: 'old-key',
        },
        'API_KEY',
      ),
    ).toEqual({
      value: 'new-key',
      source: 'codetelligence',
      variableName: 'CODETELLIGENCE_API_KEY',
      legacy: false,
    })
  })

  it('accepts the CodeMind environment namespace as a compatibility fallback', () => {
    expect(readBrandEnvironmentValue({ CODEMIND_API_KEY: 'old-key' }, 'API_KEY')).toEqual({
      value: 'old-key',
      source: 'codemind',
      variableName: 'CODEMIND_API_KEY',
      legacy: true,
    })
  })

  it('renders deterministic canonical and legacy names', () => {
    expect(codetelligenceEnvironmentVariable('MODEL')).toBe('CODETELLIGENCE_MODEL')
    expect(legacyCodeMindEnvironmentVariable('MODEL')).toBe('CODEMIND_MODEL')
    expect(renderLegacyEnvironmentWarning('MODEL')).toContain('CODETELLIGENCE_MODEL')
  })
})
