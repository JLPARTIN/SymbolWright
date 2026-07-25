import { parseRuntimeRunArgs } from './cli-runtime-run-options.js'
import {
  runReadOnlyRuntimeLoop,
  type ReadOnlyRuntimeRunResult,
} from './runtime/loop/symbolwright-agent-loop.js'

export async function renderRuntimeRun(
  args: readonly string[],
  cwd: string = process.cwd(),
): Promise<string> {
  const options = parseRuntimeRunArgs(args)

  if (!options.readOnly) {
    throw new Error('Missing required flag: symbolwright runtime run <goal> --read-only')
  }

  const result = await runReadOnlyRuntimeLoop(
    {
      goal: options.goal,
      ...(options.maxIterations !== undefined ? { maxIterations: options.maxIterations } : {}),
    },
    cwd,
  )

  if (options.json) {
    return renderRuntimeRunJson(result)
  }

  return [
    'SymbolWright runtime run',
    '',
    `Status: ${result.status}`,
    `Goal: ${result.session.goal}`,
    `Mode: ${result.session.mode}`,
    `Iterations: ${result.iterations}`,
    `Max iterations: ${result.session.maxIterations}`,
    `Final: ${result.finalMessage}`,
    '',
    result.transcriptText,
    '',
    'Boundary:',
    '- read-only/proposal tools only',
    '- no writes',
    '- no shell execution',
    '- no network',
    '- no GitHub writes',
  ].join('\n')
}

function renderRuntimeRunJson(result: ReadOnlyRuntimeRunResult): string {
  return JSON.stringify(
    {
      command: 'symbolwright runtime run',
      status: result.status,
      goal: result.session.goal,
      mode: result.session.mode,
      iterations: result.iterations,
      maxIterations: result.session.maxIterations,
      finalMessage: result.finalMessage,
      transcript: result.session.transcript,
    },
    null,
    2,
  )
}
