import { describe, expect, it } from 'vitest'

import { parseGovernedDependencyAcquisitionRequest } from './governed-dependency-acquisition.js'

describe('governed dependency acquisition request', () => {
  it('accepts only request-tightening registries and limits', () => {
    expect(
      parseGovernedDependencyAcquisitionRequest({
        registryUrls: ['https://registry.npmjs.org'],
        limits: { maxPackages: 4, maxRequests: 8 },
      }),
    ).toEqual({
      registryUrls: ['https://registry.npmjs.org'],
      limits: { maxPackages: 4, maxRequests: 8 },
    })
  })

  it.each([
    'packageJsonText',
    'packageLockPath',
    'workspaceRoot',
    'policyReference',
    'approval',
    'authorization',
    'grantId',
  ])('rejects caller-controlled authority field %s', (field) => {
    expect(() => parseGovernedDependencyAcquisitionRequest({ [field]: 'attacker' })).toThrow(
      `rejects caller-controlled authority field: ${field}`,
    )
  })

  it('rejects unknown fields rather than silently ignoring them', () => {
    expect(() => parseGovernedDependencyAcquisitionRequest({ installScripts: true })).toThrow(
      'rejects unknown request field: installScripts',
    )
  })
})
