import { describe, expect, it } from 'vitest'

import { redactMissionRecord, redactMissionText } from './mission-redaction.js'

describe('mission redaction', () => {
  it('removes representative credentials and private keys', () => {
    const value = redactMissionRecord(
      {
        Authorization: 'Bearer super-secret-bearer-token',
        apiKey: 'sk-ant-very-secret-provider-key',
        githubToken: 'ghp_abcdefghijklmnopqrstuvwxyz123456',
        url: 'https://example.com/?access_token=secret-query-value',
        privateKey: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
        safe: 'anthropic',
      },
      { CODEMIND_API_KEY: 'local-access-secret' },
    )
    const serialized = JSON.stringify(value)
    for (const secret of [
      'super-secret-bearer-token',
      'very-secret-provider-key',
      'abcdefghijklmnopqrstuvwxyz123456',
      'secret-query-value',
      'local-access-secret',
      'BEGIN PRIVATE KEY',
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(serialized).toContain('anthropic')
  })

  it('limits persisted strings', () => {
    const result = redactMissionText('x'.repeat(10_000), {}, 100)
    expect(result).toContain('[TRUNCATED')
    expect(result.length).toBeLessThan(200)
  })
})
