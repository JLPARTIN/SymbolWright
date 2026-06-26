import { describe, expect, it } from 'vitest'

import {
  SWARM_AGENT_TYPES,
  SWARM_AGENT_STATUSES,
  SWARM_TASK_STATUSES,
  type SwarmAgent,
  type SwarmTask,
  type SwarmAuditReceipt,
} from './hivemind.types.js'

describe('hivemind.types', () => {
  describe('constants', () => {
    it('SWARM_AGENT_TYPES includes all types', () => {
      expect(SWARM_AGENT_TYPES).toEqual([
        'investigator',
        'reporter',
        'analyzer',
        'coder',
        'reviewer',
      ])
    })

    it('SWARM_AGENT_STATUSES includes all statuses', () => {
      expect(SWARM_AGENT_STATUSES).toEqual(['idle', 'active', 'completed', 'failed'])
    })

    it('SWARM_TASK_STATUSES includes all statuses', () => {
      expect(SWARM_TASK_STATUSES).toEqual(['pending', 'dispatched', 'running', 'completed', 'failed'])
    })
  })

  describe('SwarmAgent', () => {
    it('has required fields', () => {
      const agent: SwarmAgent = {
        agentId: 'swarm-investigator-1',
        agentType: 'investigator',
        role: 'researcher',
        status: 'idle',
        capabilities: {
          toolCategories: ['FILE_READER', 'SEARCH_READER'],
          canRead: true,
          canWrite: false,
          canExecuteCommands: false,
          canReview: false,
        },
      }
      expect(agent.agentId).toContain('investigator')
      expect(agent.role).toBe('researcher')
    })
  })

  describe('SwarmTask', () => {
    it('has required fields', () => {
      const task: SwarmTask = {
        taskId: 'task-1',
        goal: 'Explore the codebase',
        agentType: 'investigator',
        input: { path: '/src' },
        status: 'pending',
      }
      expect(task.taskId).toBe('task-1')
      expect(task.status).toBe('pending')
    })
  })

  describe('SwarmAuditReceipt', () => {
    it('has required fields', () => {
      const receipt: SwarmAuditReceipt = {
        taskId: 'task-1',
        agentId: 'swarm-investigator-1',
        agentType: 'investigator',
        role: 'researcher',
        toolsUsed: ['read_file', 'search_files'],
        iterationCount: 3,
        tokenUsage: { inputTokens: 500, outputTokens: 200 },
        timestamp: new Date().toISOString(),
      }
      expect(receipt.toolsUsed).toHaveLength(2)
      expect(receipt.iterationCount).toBe(3)
    })
  })
})
