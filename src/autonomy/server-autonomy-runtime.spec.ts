import { describe, expect, it } from 'vitest'

import { MissionService } from '../mission/mission-service.js'
import {
  createServerAutonomyRuntime,
  DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS,
} from './server-autonomy-runtime.js'

function service(): MissionService {
  return new MissionService({ workspaceRoot: '/tmp/codemind-autonomy-runtime-test', env: {} })
}

describe('createServerAutonomyRuntime', () => {
  it('assembles coordinator, controls, execution persistence, and executor', () => {
    const runtime = createServerAutonomyRuntime({
      workspaceRoot: '/tmp/codemind-autonomy-runtime-test',
      missionService: service(),
      hasGitHubToken: false,
    })

    expect(runtime.coordinator).toBeDefined()
    expect(runtime.control).toBeDefined()
    expect(runtime.executionStore).toBeDefined()
    expect(runtime.executor).toBeDefined()
  })

  it('provides the full default validation sequence', () => {
    expect(DEFAULT_AUTONOMOUS_VALIDATION_COMMANDS).toEqual([
      'npm run typecheck',
      'npm run lint',
      'npm test',
      'npm run build',
    ])
  })

  it('accepts a real edit executor and custom validation commands', () => {
    const runtime = createServerAutonomyRuntime({
      workspaceRoot: '/tmp/codemind-autonomy-runtime-test',
      missionService: service(),
      hasGitHubToken: true,
      validationCommands: ['npm run validate'],
      editExecutor: {
        async execute() {
          return { state: 'completed', modifiedFiles: ['src/example.ts'] }
        },
      },
    })

    expect(runtime.executor).toBeDefined()
  })
})
