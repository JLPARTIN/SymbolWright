import { describe, expect, it } from 'vitest'

import {
  createValidationTranscript,
  renderValidationTranscript,
} from './validation-command-transcript.js'

describe('createValidationTranscript', () => {
  it('creates a transcript with all input fields and a recordedAt timestamp', () => {
    const transcript = createValidationTranscript({
      command: 'npm run typecheck',
      reason: 'type safety',
      dryRun: false,
      outcome: 'PASS',
      exitCode: 0,
      redactedStdout: 'all good',
      redactedStderr: '',
      elapsedMs: 42,
      blockReasons: [],
    })

    expect(transcript.command).toBe('npm run typecheck')
    expect(transcript.reason).toBe('type safety')
    expect(transcript.dryRun).toBe(false)
    expect(transcript.outcome).toBe('PASS')
    expect(transcript.exitCode).toBe(0)
    expect(transcript.redactedStdout).toBe('all good')
    expect(transcript.redactedStderr).toBe('')
    expect(transcript.elapsedMs).toBe(42)
    expect(transcript.blockReasons).toHaveLength(0)
    expect(transcript.recordedAt).toBeTruthy()
    expect(new Date(transcript.recordedAt).toISOString()).toBe(transcript.recordedAt)
  })

  it('preserves block reasons for BLOCKED outcomes', () => {
    const transcript = createValidationTranscript({
      command: 'rm -rf /',
      reason: 'evil',
      dryRun: false,
      outcome: 'BLOCKED',
      exitCode: null,
      redactedStdout: '',
      redactedStderr: '',
      elapsedMs: 0,
      blockReasons: ['Command not allowlisted', 'No approval'],
    })

    expect(transcript.outcome).toBe('BLOCKED')
    expect(transcript.exitCode).toBeNull()
    expect(transcript.blockReasons).toEqual(['Command not allowlisted', 'No approval'])
  })

  it('preserves DRY_RUN outcome', () => {
    const transcript = createValidationTranscript({
      command: 'npm run lint',
      reason: 'check formatting',
      dryRun: true,
      outcome: 'DRY_RUN',
      exitCode: null,
      redactedStdout: '',
      redactedStderr: '',
      elapsedMs: 0,
      blockReasons: [],
    })

    expect(transcript.dryRun).toBe(true)
    expect(transcript.outcome).toBe('DRY_RUN')
  })
})

describe('renderValidationTranscript', () => {
  it('renders all transcript fields', () => {
    const transcript = createValidationTranscript({
      command: 'npm run typecheck',
      reason: 'type safety',
      dryRun: false,
      outcome: 'PASS',
      exitCode: 0,
      redactedStdout: 'output here',
      redactedStderr: '',
      elapsedMs: 150,
      blockReasons: [],
    })
    const output = renderValidationTranscript(transcript)

    expect(output).toContain('Validation Command Transcript')
    expect(output).toContain('Command: npm run typecheck')
    expect(output).toContain('Reason: type safety')
    expect(output).toContain('Outcome: PASS')
    expect(output).toContain('Exit code: 0')
    expect(output).toContain('Elapsed: 150ms')
    expect(output).toContain('Dry run: no')
    expect(output).toContain('Recorded:')
  })

  it('shows "not run" for null exit code', () => {
    const transcript = createValidationTranscript({
      command: 'npm run lint',
      reason: 'preview',
      dryRun: true,
      outcome: 'DRY_RUN',
      exitCode: null,
      redactedStdout: '',
      redactedStderr: '',
      elapsedMs: 0,
      blockReasons: [],
    })
    const output = renderValidationTranscript(transcript)

    expect(output).toContain('Exit code: not run')
    expect(output).toContain('Dry run: yes')
  })

  it('renders block reasons when present', () => {
    const transcript = createValidationTranscript({
      command: 'rm -rf /',
      reason: 'test',
      dryRun: false,
      outcome: 'BLOCKED',
      exitCode: null,
      redactedStdout: '',
      redactedStderr: '',
      elapsedMs: 0,
      blockReasons: ['Command not allowlisted', 'Shell disabled'],
    })
    const output = renderValidationTranscript(transcript)

    expect(output).toContain('Block reasons:')
    expect(output).toContain('- Command not allowlisted')
    expect(output).toContain('- Shell disabled')
  })

  it('omits block reasons section when empty', () => {
    const transcript = createValidationTranscript({
      command: 'npm run typecheck',
      reason: 'test',
      dryRun: false,
      outcome: 'PASS',
      exitCode: 0,
      redactedStdout: '',
      redactedStderr: '',
      elapsedMs: 5,
      blockReasons: [],
    })
    const output = renderValidationTranscript(transcript)

    expect(output).not.toContain('Block reasons:')
  })
})
