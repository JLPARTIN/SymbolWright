export interface RuntimeRunCliOptions {
  readonly goal: string
  readonly readOnly: boolean
  readonly json: boolean
  readonly maxIterations?: number
}

const MAX_RUNTIME_RUN_ITERATIONS = 25

export function parseRuntimeRunArgs(args: readonly string[]): RuntimeRunCliOptions {
  const goalParts: string[] = []
  let readOnly = false
  let json = false
  let maxIterations: number | undefined

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === undefined) {
      continue
    }

    if (arg === '--read-only') {
      readOnly = true
      continue
    }

    if (arg === '--json') {
      json = true
      continue
    }

    if (arg === '--max-iterations') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Missing value for --max-iterations')
      }
      maxIterations = parseMaxIterations(value)
      index += 1
      continue
    }

    if (arg.startsWith('--max-iterations=')) {
      maxIterations = parseMaxIterations(arg.slice('--max-iterations='.length))
      continue
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown runtime run flag: ${arg}`)
    }

    goalParts.push(arg)
  }

  return {
    goal: goalParts.join(' ').trim(),
    readOnly,
    json,
    ...(maxIterations !== undefined ? { maxIterations } : {}),
  }
}

function parseMaxIterations(value: string): number {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid --max-iterations value: ${value}`)
  }

  const parsed = Number(trimmed)
  if (parsed < 1 || parsed > MAX_RUNTIME_RUN_ITERATIONS) {
    throw new Error(
      `--max-iterations must be an integer between 1 and ${MAX_RUNTIME_RUN_ITERATIONS}`,
    )
  }

  return parsed
}
