import type { OperatorHistoryEntry, OperatorSessionState } from './operator-types.js'

export function renderOperatorBanner(session: OperatorSessionState): string {
  return [
    'SymbolWright Operator Workspace',
    '================================',
    `Workspace: ${session.cwd}`,
    `Session:   ${session.sessionId}`,
    'Mode:      READ_ONLY cockpit by default',
    'Mutation:  approval-gated through existing SymbolWright policy gates',
    'GitHub:    write-gated; no merge or push from operator console',
    '',
    'Type a mission or use /help for commands.',
  ].join('\n')
}

export function renderOperatorPrompt(): string {
  return 'SymbolWright > '
}

export function renderOperatorHelp(): string {
  return [
    'SymbolWright Operator Commands',
    '',
    'Mission input:',
    '  Type plain text to create a read-only mission plan.',
    '',
    'Workspace commands:',
    '  /status                 Show platform posture',
    '  /doctor                 Run workspace health report',
    '  /runtime-status         Show runtime dashboard',
    '  /scan [dir]             Summarize repository structure',
    '  /read <path>            Read an allowed workspace file',
    '  /search <query>         Search allowed workspace files',
    '',
    'Mission commands:',
    '  /plan <goal>            Render a non-mutating work plan',
    '  /run <goal>             Run bounded read-only runtime loop',
    '  /validation-plan [x]    Render validation guidance',
    '  /propose <goal>         Draft a patch proposal without applying it',
    '  /pr-notes [focus]       Draft PR notes without posting them',
    '  /zflow <fixture>        Render ZFlow report from fixture file',
    '',
    'Workspace management:',
    '  /workspace              Show workspace repos and primary selection',
    '',
    'Session commands:',
    '  /history                Show saved operator command history',
    '  /session                Show current session metadata',
    '  /clear                  Clear saved operator history',
    '  /exit                  Exit operator console',
  ].join('\n')
}

export function renderMissionAccepted(goal: string): string {
  return [
    'MISSION ACCEPTED',
    '',
    `Goal: ${goal}`,
    'Boundary:',
    '- read-only planning first',
    '- no file writes without approval',
    '- no shell execution from plain mission input',
    '- no GitHub mutation',
    '',
    'Plan output:',
  ].join('\n')
}

export function renderOperatorHistory(entries: readonly OperatorHistoryEntry[]): string {
  if (entries.length === 0) {
    return 'No operator history recorded yet.'
  }

  const lines = ['Operator History', '']
  entries.forEach((entry, index) => {
    lines.push(`${index + 1}. [${entry.kind}] ${entry.input} (${entry.timestamp})`)
  })
  return lines.join('\n')
}

export function renderOperatorSession(session: OperatorSessionState): string {
  return [
    'Operator Session',
    '',
    `Session: ${session.sessionId}`,
    `Workspace: ${session.cwd}`,
    `Started: ${session.startedAt}`,
    `History entries: ${session.history.length}`,
    `Last mission: ${session.lastMission ?? 'none'}`,
  ].join('\n')
}
