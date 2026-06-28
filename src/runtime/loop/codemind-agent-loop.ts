import {
  createFixtureContext,
  createFixtureRegistry,
} from '../registry/fixture-registry-factory.js'
import { createRuntimeSession, type RuntimeSession } from '../session/runtime-session.js'
import { appendTranscriptEntry, renderRuntimeTranscript } from '../transcript/runtime-transcript.js'
import type { RuntimeLoopResult } from '../types.js'

export interface ReadOnlyRuntimeRunInput {
  readonly goal: string
  readonly maxIterations?: number
}

export interface ReadOnlyRuntimeRunResult extends RuntimeLoopResult {
  readonly session: RuntimeSession
  readonly transcriptText: string
}

const ALLOWED_TOOL_SEQUENCE = ['plan_goal', 'validation_plan', 'propose_edit'] as const

type AllowedToolName = (typeof ALLOWED_TOOL_SEQUENCE)[number]

export async function runReadOnlyRuntimeLoop(
  input: ReadOnlyRuntimeRunInput,
  cwd: string = process.cwd(),
): Promise<ReadOnlyRuntimeRunResult> {
  const maxIterations = input.maxIterations ?? ALLOWED_TOOL_SEQUENCE.length
  let session = createRuntimeSession(input.goal, maxIterations)
  const registry = createFixtureRegistry('proposal')
  const context = createFixtureContext(cwd)
  let finalMessage = 'Runtime loop completed.'
  let iterations = 0

  for (const toolName of ALLOWED_TOOL_SEQUENCE) {
    if (iterations >= session.maxIterations) {
      finalMessage = 'Runtime loop stopped at iteration limit.'
      return {
        status: 'iteration_limit',
        finalMessage,
        iterations,
        session,
        transcriptText: renderRuntimeTranscript(session.transcript),
      }
    }

    iterations += 1
    session = {
      ...session,
      transcript: appendTranscriptEntry(session.transcript, {
        iteration: iterations,
        role: 'tool',
        message: `invoke ${toolName}`,
      }),
    }

    const result = await runAllowedTool(toolName, input.goal, registry, context)
    session = {
      ...session,
      transcript: appendTranscriptEntry(session.transcript, {
        iteration: iterations,
        role: 'result',
        message: firstLine(result),
      }),
    }
  }

  return {
    status: 'completed',
    finalMessage,
    iterations,
    session,
    transcriptText: renderRuntimeTranscript(session.transcript),
  }
}

async function runAllowedTool(
  toolName: AllowedToolName,
  goal: string,
  registry: ReturnType<typeof createFixtureRegistry>,
  context: ReturnType<typeof createFixtureContext>,
): Promise<string> {
  if (toolName === 'plan_goal') {
    return registry.getOrThrow(toolName).execute({ goal }, context)
  }

  if (toolName === 'validation_plan') {
    return registry.getOrThrow(toolName).execute({ focus: goal }, context)
  }

  return registry.getOrThrow(toolName).execute({ goal }, context)
}

function firstLine(value: string): string {
  return value.split('\n')[0] ?? value
}
