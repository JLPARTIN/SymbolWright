import { describe, expect, it, beforeEach } from 'vitest'

import { HiveMindRemoteBridge } from './hivemind-remote-bridge.js'
import type {
  HiveMindRemoteDispatchRequest,
} from './hivemind-remote-bridge.js'

function makeRequest(overrides?: Partial<HiveMindRemoteDispatchRequest>): HiveMindRemoteDispatchRequest {
  return {
    taskId: 'task-1',
    agentType: 'investigator',
    goal: 'explore the codebase',
    input: {},
    workspacePath: '/workspace',
    ...overrides,
  }
}

describe('HiveMindRemoteBridge', () => {
  let bridge: HiveMindRemoteBridge

  beforeEach(() => {
    bridge = new HiveMindRemoteBridge()
  })

  describe('getStatus', () => {
    it('reports connected for local transport', () => {
      const status = bridge.getStatus()
      expect(status.connected).toBe(true)
      expect(status.transport).toBe('local')
      expect(status.availableAgentTypes).toHaveLength(5)
      expect(status.activeAgents).toBe(0)
      expect(status.lastHeartbeat).toBeTruthy()
    })

    it('reports disconnected for remote transport', () => {
      const remote = new HiveMindRemoteBridge({
        transport: 'http',
        endpoint: 'http://localhost:8080',
        timeoutMs: 30000,
        maxConcurrentAgents: 3,
      })
      const status = remote.getStatus()
      expect(status.connected).toBe(false)
      expect(status.transport).toBe('http')
      expect(status.availableAgentTypes).toHaveLength(0)
    })
  })

  describe('dispatch', () => {
    it('dispatches locally and returns completed', async () => {
      const response = await bridge.dispatch(makeRequest())
      expect(response.status).toBe('completed')
      expect(response.taskId).toBe('task-1')
      expect(response.output).toContain('investigator')
      expect(response.auditReceipt.agentType).toBe('investigator')
    })

    it('fails for remote transport (not yet implemented)', async () => {
      const remote = new HiveMindRemoteBridge({
        transport: 'http',
        endpoint: 'http://localhost:8080',
        timeoutMs: 30000,
        maxConcurrentAgents: 3,
      })
      const response = await remote.dispatch(makeRequest())
      expect(response.status).toBe('failed')
      expect(response.error).toContain('not yet implemented')
    })

    it('fails when max concurrent agents reached', async () => {
      const limited = new HiveMindRemoteBridge({
        transport: 'local',
        timeoutMs: 30000,
        maxConcurrentAgents: 0,
      })
      const response = await limited.dispatch(makeRequest())
      expect(response.status).toBe('failed')
      expect(response.error).toContain('Maximum concurrent agents')
    })

    it('cleans up active task after dispatch', async () => {
      await bridge.dispatch(makeRequest())
      expect(bridge.getActiveTasks()).toHaveLength(0)
    })

    it('includes audit receipt', async () => {
      const response = await bridge.dispatch(makeRequest({ agentType: 'coder' }))
      expect(response.auditReceipt.taskId).toBe('task-1')
      expect(response.auditReceipt.agentType).toBe('coder')
      expect(response.auditReceipt.timestamp).toBeTruthy()
    })
  })

  describe('getConfig', () => {
    it('returns the configuration', () => {
      const config = bridge.getConfig()
      expect(config.transport).toBe('local')
      expect(config.timeoutMs).toBe(300_000)
      expect(config.maxConcurrentAgents).toBe(5)
    })
  })

  describe('isRemote', () => {
    it('returns false for local transport', () => {
      expect(bridge.isRemote()).toBe(false)
    })

    it('returns true for http transport', () => {
      const remote = new HiveMindRemoteBridge({
        transport: 'http',
        endpoint: 'http://localhost:8080',
        timeoutMs: 30000,
        maxConcurrentAgents: 3,
      })
      expect(remote.isRemote()).toBe(true)
    })
  })

  describe('toDispatchResult', () => {
    it('converts response to SwarmDispatchResult', async () => {
      const response = await bridge.dispatch(makeRequest())
      const result = bridge.toDispatchResult(response, 42)
      expect(result.taskId).toBe('task-1')
      expect(result.status).toBe('completed')
      expect(result.durationMs).toBe(42)
    })

    it('maps failed status correctly', () => {
      const result = bridge.toDispatchResult({
        taskId: 'task-1',
        status: 'failed',
        output: '',
        error: 'boom',
        auditReceipt: {
          taskId: 'task-1',
          agentId: 'remote-investigator-task-1',
          agentType: 'investigator',
          role: 'researcher',
          toolsUsed: [],
          iterationCount: 0,
          tokenUsage: { inputTokens: 0, outputTokens: 0 },
          timestamp: new Date().toISOString(),
        },
      }, 10)
      expect(result.status).toBe('failed')
    })
  })
})
