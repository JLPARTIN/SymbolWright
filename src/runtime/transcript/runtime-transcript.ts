export type RuntimeTranscriptRole = 'system' | 'tool' | 'result'

export interface RuntimeTranscriptEntry {
  readonly iteration: number
  readonly role: RuntimeTranscriptRole
  readonly message: string
}

export interface RuntimeTranscript {
  readonly goal: string
  readonly entries: readonly RuntimeTranscriptEntry[]
}

export function appendTranscriptEntry(
  transcript: RuntimeTranscript,
  entry: RuntimeTranscriptEntry,
): RuntimeTranscript {
  return {
    goal: transcript.goal,
    entries: [...transcript.entries, entry],
  }
}

export function renderRuntimeTranscript(transcript: RuntimeTranscript): string {
  return [
    'Runtime transcript',
    '',
    `Goal: ${transcript.goal}`,
    '',
    ...transcript.entries.map(
      (entry) => `[${entry.iteration}] ${entry.role.toUpperCase()}: ${entry.message}`,
    ),
  ].join('\n')
}
