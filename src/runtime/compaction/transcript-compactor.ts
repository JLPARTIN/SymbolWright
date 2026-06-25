import type { RuntimeTranscript } from '../transcript/runtime-transcript.js'

export interface CompactedTranscript {
  readonly goal: string
  readonly entryCount: number
  readonly summary: readonly string[]
}

export function compactTranscript(transcript: RuntimeTranscript): CompactedTranscript {
  return {
    goal: transcript.goal,
    entryCount: transcript.entries.length,
    summary: transcript.entries.slice(-5).map((entry) => `${entry.role}: ${entry.message}`),
  }
}
