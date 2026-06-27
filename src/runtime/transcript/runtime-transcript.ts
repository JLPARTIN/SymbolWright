/** Roles that can appear in a runtime transcript entry. */
export type RuntimeTranscriptRole = 'system' | 'tool' | 'result'

/** A single entry in the runtime transcript with iteration, role, and message. */
export interface RuntimeTranscriptEntry {
  readonly iteration: number
  readonly role: RuntimeTranscriptRole
  readonly message: string
}

/** Immutable transcript of a runtime session's iterations. */
export interface RuntimeTranscript {
  readonly goal: string
  readonly entries: readonly RuntimeTranscriptEntry[]
}

/** Returns a new transcript with the entry appended (immutable). */
export function appendTranscriptEntry(
  transcript: RuntimeTranscript,
  entry: RuntimeTranscriptEntry,
): RuntimeTranscript {
  return {
    goal: transcript.goal,
    entries: [...transcript.entries, entry],
  }
}

/** Renders the transcript as a human-readable multi-line string. */
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
