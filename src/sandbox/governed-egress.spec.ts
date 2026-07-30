import { describe, expect, it } from 'vitest'

import { parseGovernedEgressRequest } from './governed-egress.js'

describe('governed egress request parsing', () => {
  it('accepts bounded caller request fields', () => {
    expect(
      parseGovernedEgressRequest({
        url: 'https://docs.example.com/guide',
        method: 'get',
        headers: { accept: 'text/plain' },
        limits: { maxRequests: 1 },
      }),
    ).toEqual({
      url: 'https://docs.example.com/guide',
      method: 'GET',
      headers: { accept: 'text/plain' },
      limits: { maxRequests: 1 },
    })
  })

  it.each(['policy', 'approval', 'grantId', 'sessionId', 'proxy', 'pinnedAddress'])(
    'rejects caller-controlled authority field %s',
    (field) => {
      expect(() => parseGovernedEgressRequest({ url: 'https://example.com', [field]: 'x' })).toThrow(
        'rejects caller-controlled authority field',
      )
    },
  )
})
