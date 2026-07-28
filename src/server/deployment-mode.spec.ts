import { describe, expect, it } from 'vitest'

import { DeploymentConfigError, resolveDeploymentSecurity } from './deployment-mode.js'

describe('deployment mode', () => {
  it('keeps loopback local mode zero-config', () => {
    expect(resolveDeploymentSecurity({ host: '127.0.0.1' }).deploymentMode).toBe('local')
  })

  it('fails closed for non-loopback plaintext local binding without the escape hatch', () => {
    expect(() => resolveDeploymentSecurity({ host: '0.0.0.0' })).toThrow(DeploymentConfigError)
  })

  it('does not mistake a hostname beginning with 127 for a loopback address', () => {
    expect(() => resolveDeploymentSecurity({ host: '127.attacker.example' })).toThrow(
      DeploymentConfigError,
    )
  })

  it('allows the non-loopback plaintext escape hatch only in local mode and emits a warning', () => {
    const result = resolveDeploymentSecurity({
      host: '0.0.0.0',
      deploymentMode: 'local',
      allowUnencryptedNonLoopback: true,
    })
    expect(result.warnings).toHaveLength(1)
  })

  it('requires real TLS or trusted proxy plus explicit concurrency caps in hosted mode', () => {
    expect(() => resolveDeploymentSecurity({ host: '0.0.0.0', deploymentMode: 'hosted' })).toThrow(
      DeploymentConfigError,
    )
    expect(() =>
      resolveDeploymentSecurity({
        host: '0.0.0.0',
        deploymentMode: 'hosted',
        trustedProxyCidrs: ['127.0.0.1/32'],
      }),
    ).toThrow(/concurrency caps/)
  })

  it('accepts a fully specified hosted trusted-proxy topology', () => {
    const result = resolveDeploymentSecurity({
      host: '127.0.0.1',
      deploymentMode: 'hosted',
      trustedProxyCidrs: ['127.0.0.1/32'],
      maxProviderConcurrency: 4,
      maxSseStreams: 2,
      maxAutonomousExecutions: 1,
    })
    expect(result.trustedProxyCidrs).toHaveLength(1)
  })

  it('forbids the plaintext escape hatch in hosted mode', () => {
    expect(() =>
      resolveDeploymentSecurity({
        deploymentMode: 'hosted',
        trustedProxyCidrs: ['127.0.0.1/32'],
        allowUnencryptedNonLoopback: true,
        maxProviderConcurrency: 1,
        maxSseStreams: 1,
        maxAutonomousExecutions: 1,
      }),
    ).toThrow(/forbidden/)
  })
})
