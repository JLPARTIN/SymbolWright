import { runReadOnlyRuntimeLoop } from './runtime/loop/codemind-agent-loop.js'

export async function renderRuntimeRun(args: readonly string[], cwd: string = process.cwd()): Promise<string> {
  const readOnly = args.includes('--read-only')
  const goal = args.filter((arg) => arg !== '--read-only').join(' ')

  if (!readOnly) {
    throw new Error('Missing required flag: codemind runtime run <goal> --read-only')
  }

  const result = await runReadOnlyRuntimeLoop({ goal }, cwd)

  return [
    'CodeMind runtime run',
    '',
    `Status: ${result.status}`,
    `Iterations: ${result.iterations}`,
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
