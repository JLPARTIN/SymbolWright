/**
 * Pure, dependency-free logic shared by the embedded Agent transcript
 * browser client. Same technique as `workspace-client-logic.ts`: real
 * functions unit-tested under Vitest, then inlined into the browser via
 * `fn.toString()` so there is exactly one source of truth for the SSE
 * parsing and tool-event formatting the old `chat-ui-html.ts` duplicated
 * as untestable inline strings.
 */

export interface ParsedSseFrame {
  readonly eventType: string
  readonly data: string
}

export interface SseParseResult {
  readonly frames: readonly ParsedSseFrame[]
  readonly remainder: string
}

/** Splits a growing SSE text buffer into complete `event:`/`data:` frames, returning any incomplete tail as `remainder`. */
export function parseSseBuffer(buffer: string): SseParseResult {
  const frames: ParsedSseFrame[] = []
  let remaining = buffer
  let boundary = remaining.indexOf('\n\n')

  while (boundary !== -1) {
    const frame = remaining.slice(0, boundary)
    remaining = remaining.slice(boundary + 2)
    boundary = remaining.indexOf('\n\n')

    const lines = frame.split('\n')
    let eventType = 'message'
    let dataLine = ''
    for (const line of lines) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim()
      if (line.startsWith('data:')) dataLine = line.slice(5).trim()
    }
    if (!dataLine) continue
    frames.push({ eventType, data: dataLine })
  }

  return { frames, remainder: remaining }
}

export function truncateToolOutputPreview(output: string, maxLength = 400): string {
  return output.length > maxLength ? output.slice(0, maxLength) + '…' : output
}

export function formatToolCallStartMessage(name: string): string {
  return '🔧 calling ' + name + '...'
}

export function formatToolCallEndMessage(name: string, output: string, isError: boolean): string {
  return (isError ? '⚠️ ' : '✓ ') + name + ' → ' + truncateToolOutputPreview(output)
}
