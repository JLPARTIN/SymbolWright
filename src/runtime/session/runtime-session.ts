import type { RuntimeTranscript } from '../transcript/runtime-transcript.js'

export interface RuntimeSession {
  readonly id: string
  readonly goal: string
  readonly mode: 'READ_ONLY'
  readonly maxIterations: number
  readonly transcript: RuntimeTranscript
}

export function createRuntimeSession(goal: string, maxIterations = 4): RuntimeSession {
  const trimmedGoal = goal.trim()
  if (trimmedGoal.length === 0) {
    throw new Error('Missing goal: codemind runtime run <goal> --read-only')
  }

  return {
    id: `readonly-${Date.now()}`,
    goal: trimmedGoal,
    mode: 'READ_ONLY',
    maxIterations,
    transcript: {
      goal: trimmedGoal,
      entries: [],
    },
  }
}
