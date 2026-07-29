export type RuntimeState = 'pass' | 'warn' | 'fail' | 'unknown'

export interface ScriptOutput {
  name: string
  exitCode: number
  output: string
  durationMs: number
}

export interface StatusCard {
  label: string
  value: string
  state: RuntimeState
}

export interface RuntimeStatusView {
  overallState: RuntimeState
  generatedAt: string
  cards: StatusCard[]
  scripts: ScriptOutput[]
}

export function extractValue(output: string, pattern: RegExp, fallback = 'Unknown'): string {
  const match = output.match(pattern)
  return match?.[1]?.trim() || fallback
}

export function classifyDoctor(output: string, exitCode: number): RuntimeState {
  if (exitCode !== 0) return 'fail'

  const health = extractValue(output, /Health:\s*([A-Z_]+)/i).toUpperCase()

  if (health === 'HEALTHY') return 'pass'
  if (health.includes('WARN')) return 'warn'
  if (health.includes('FAIL') || health.includes('BLOCK')) return 'fail'

  return 'unknown'
}

export function classifyReleaseReadiness(output: string, exitCode: number): RuntimeState {
  if (exitCode !== 0) return 'fail'

  const outcome = extractValue(output, /Outcome:\s*([A-Z_]+)/i).toUpperCase()

  if (outcome === 'RELEASE_READY') return 'pass'
  if (outcome.includes('WARN')) return 'warn'
  if (outcome.includes('BLOCK') || outcome.includes('FAIL')) return 'fail'

  return 'unknown'
}

export function combineStates(states: RuntimeState[]): RuntimeState {
  if (states.includes('fail')) return 'fail'
  if (states.includes('warn')) return 'warn'
  if (states.every((state) => state === 'pass')) return 'pass'
  return 'unknown'
}

export function buildRuntimeStatusView(
  doctor: ScriptOutput,
  releaseReadiness: ScriptOutput,
): RuntimeStatusView {
  const doctorState = classifyDoctor(doctor.output, doctor.exitCode)
  const releaseState = classifyReleaseReadiness(releaseReadiness.output, releaseReadiness.exitCode)

  const cards: StatusCard[] = [
    {
      label: 'Doctor health',
      value: extractValue(doctor.output, /Health:\s*([A-Z_]+)/i),
      state: doctorState,
    },
    {
      label: 'Release readiness',
      value: extractValue(releaseReadiness.output, /Outcome:\s*([A-Z_]+)/i),
      state: releaseState,
    },
    {
      label: 'Runtime phases',
      value: extractValue(doctor.output, /Runtime phases:\s*([^\n]+)/i),
      state: doctorState,
    },
    {
      label: 'Tool registry',
      value: extractValue(doctor.output, /Tool registry:\s*([^\n]+)/i),
      state: doctorState,
    },
    {
      label: 'Provider gateway',
      value: extractValue(doctor.output, /Provider gateway:\s*([^\n]+)/i),
      state: doctorState,
    },
    {
      label: 'Sandbox readiness',
      value: extractValue(doctor.output, /Sandbox readiness:\s*([^\n]+)/i),
      state: doctorState,
    },

    {
      label: 'Sandbox egress',
      value: extractValue(doctor.output, /Sandbox egress:\s*([^\n]+)/i),
      state: doctorState,
    },
    {
      label: 'Session directory',
      value: extractValue(doctor.output, /Session directory:\s*([^\n]+)/i),
      state: doctorState,
    },
    {
      label: 'Project memory',
      value: extractValue(doctor.output, /Project memory:\s*([^\n]+)/i),
      state: doctorState,
    },
  ]

  return {
    overallState: combineStates([doctorState, releaseState]),
    generatedAt: new Date().toISOString(),
    cards,
    scripts: [doctor, releaseReadiness],
  }
}
