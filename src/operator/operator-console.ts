import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'

import { renderDoctorCommand } from '../cli-doctor.js'
import { renderRuntimePlan } from '../cli-runtime-plan.js'
import { renderRuntimePrNotes } from '../cli-runtime-pr-notes.js'
import { renderRuntimeProposePatch } from '../cli-runtime-propose-patch.js'
import { renderRuntimeRead } from '../cli-runtime-read.js'
import { renderRuntimeRun } from '../cli-runtime-run.js'
import { renderRuntimeSearch } from '../cli-runtime-search.js'
import { renderRuntimeValidationPlan } from '../cli-runtime-validation-plan.js'
import { renderRuntimeStatusDashboardCommand } from '../cli-runtime-status-dashboard.js'
import { renderRuntimeZflowReport } from '../cli-runtime-zflow-report.js'
import { renderScan, scanRepo } from '../cli-scan.js'
import { renderStatus } from '../cli-commands.js'
import { buildWorkspaceState, renderWorkspaceState } from '../cli-workspace.js'
import { joinOperatorArgs, parseOperatorInput } from './operator-input-parser.js'
import { OperatorHistoryStore } from './operator-history-store.js'
import {
  renderMissionAccepted,
  renderOperatorBanner,
  renderOperatorHelp,
  renderOperatorHistory,
  renderOperatorPrompt,
  renderOperatorSession,
} from './operator-renderer.js'
import type {
  OperatorCommandResult,
  OperatorConsoleHandlers,
  OperatorHistoryEntry,
  OperatorSessionState,
  ParsedOperatorInput,
} from './operator-types.js'

export function createOperatorSession(
  cwd: string = process.cwd(),
  history: readonly OperatorHistoryEntry[] = [],
): OperatorSessionState {
  return {
    sessionId: `operator-${Date.now()}`,
    cwd,
    startedAt: new Date().toISOString(),
    history,
  }
}

function renderDefaultWorkspace(cwd: string): string {
  return renderWorkspaceState(buildWorkspaceState(cwd))
}

export function createDefaultOperatorConsoleHandlers(): OperatorConsoleHandlers {
  return {
    renderStatus,
    renderDoctor: renderDoctorCommand,
    renderRuntimeStatus: renderRuntimeStatusDashboardCommand,
    renderScan: (dir: string) => renderScan(scanRepo(dir)),
    renderPlan: renderRuntimePlan,
    renderRun: async (goal: string, cwd: string) => renderRuntimeRun([goal, '--read-only'], cwd),
    renderRead: renderRuntimeRead,
    renderSearch: renderRuntimeSearch,
    renderValidationPlan: renderRuntimeValidationPlan,
    renderProposePatch: renderRuntimeProposePatch,
    renderPrNotes: renderRuntimePrNotes,
    renderZflowReport: renderRuntimeZflowReport,
    renderWorkspace: renderDefaultWorkspace,
  }
}

export async function runOperatorInput(
  raw: string,
  session: OperatorSessionState,
  handlers: OperatorConsoleHandlers = createDefaultOperatorConsoleHandlers(),
  historyStore?: OperatorHistoryStore,
): Promise<OperatorCommandResult> {
  const parsed = parseOperatorInput(raw)

  if (parsed.kind === 'empty') {
    return { exit: false, output: '', session }
  }

  const nextSession = recordInput(session, parsed, historyStore)

  if (parsed.kind === 'invalid') {
    return {
      exit: false,
      output: `${parsed.error}\n\n${renderOperatorHelp()}`,
      session: nextSession,
    }
  }

  if (parsed.kind === 'mission') {
    const plan = await handlers.renderPlan(parsed.goal, session.cwd)
    return {
      exit: false,
      output: `${renderMissionAccepted(parsed.goal)}\n\n${plan}`,
      session: { ...nextSession, lastMission: parsed.goal },
    }
  }

  return handleSlashInput(parsed, nextSession, handlers, historyStore)
}

export async function runOperatorCommand(args: readonly string[]): Promise<void> {
  const cwd = process.cwd()
  const historyStore = OperatorHistoryStore.fromWorkspace(cwd)
  const session = createOperatorSession(cwd, historyStore.list())
  const handlers = createDefaultOperatorConsoleHandlers()

  if (args.includes('--help') || args.includes('-h')) {
    console.log(renderOperatorHelp())
    return
  }

  const oneShotInput = args.join(' ').trim()
  if (oneShotInput.length > 0) {
    const result = await runOperatorInput(oneShotInput, session, handlers, historyStore)
    if (result.output.length > 0) {
      console.log(result.output)
    }
    return
  }

  await runInteractiveOperatorLoop(session, handlers, historyStore)
}

async function runInteractiveOperatorLoop(
  initialSession: OperatorSessionState,
  handlers: OperatorConsoleHandlers,
  historyStore: OperatorHistoryStore,
): Promise<void> {
  let session = initialSession
  const rl = createInterface({ input: stdin, output: stdout })
  console.log(renderOperatorBanner(session))

  try {
    for (;;) {
      const line = await rl.question(renderOperatorPrompt())
      const result = await runOperatorInput(line, session, handlers, historyStore)
      session = result.session
      if (result.output.length > 0) {
        console.log(`\n${result.output}\n`)
      }
      if (result.exit) {
        break
      }
    }
  } finally {
    rl.close()
  }
}

async function handleSlashInput(
  parsed: Extract<ParsedOperatorInput, { kind: 'slash' }>,
  session: OperatorSessionState,
  handlers: OperatorConsoleHandlers,
  historyStore?: OperatorHistoryStore,
): Promise<OperatorCommandResult> {
  const argsText = joinOperatorArgs(parsed.args)

  switch (parsed.command) {
    case 'help':
      return continueWith(renderOperatorHelp(), session)
    case 'status':
      return continueWith(handlers.renderStatus(), session)
    case 'doctor':
      return continueWith(handlers.renderDoctor(session.cwd), session)
    case 'runtime-status':
      return continueWith(handlers.renderRuntimeStatus(), session)
    case 'scan':
      return continueWith(
        handlers.renderScan(argsText.length > 0 ? argsText : session.cwd),
        session,
      )
    case 'plan':
      return continueWith(
        await requireText(argsText, 'Usage: /plan <goal>', handlers.renderPlan, session.cwd),
        session,
      )
    case 'run':
      return continueWith(
        await requireText(argsText, 'Usage: /run <goal>', handlers.renderRun, session.cwd),
        session,
      )
    case 'read':
      return continueWith(
        await requireText(argsText, 'Usage: /read <path>', handlers.renderRead, session.cwd),
        session,
      )
    case 'search':
      return continueWith(
        await requireText(argsText, 'Usage: /search <query>', handlers.renderSearch, session.cwd),
        session,
      )
    case 'validation-plan':
      return continueWith(
        await handlers.renderValidationPlan(
          argsText.length > 0 ? argsText : undefined,
          session.cwd,
        ),
        session,
      )
    case 'propose':
      return continueWith(
        await requireText(
          argsText,
          'Usage: /propose <goal>',
          handlers.renderProposePatch,
          session.cwd,
        ),
        session,
      )
    case 'pr-notes':
      return continueWith(
        await handlers.renderPrNotes(argsText.length > 0 ? argsText : undefined, session.cwd),
        session,
      )
    case 'zflow':
      return continueWith(
        await requireText(
          argsText,
          'Usage: /zflow <fixture-path>',
          handlers.renderZflowReport,
          session.cwd,
        ),
        session,
      )
    case 'workspace':
      return continueWith(handlers.renderWorkspace(session.cwd), session)
    case 'history':
      return continueWith(renderOperatorHistory(historyStore?.list() ?? session.history), session)
    case 'session':
      return continueWith(renderOperatorSession(session), session)
    case 'clear':
      historyStore?.clear()
      return continueWith('Operator history cleared.', { ...session, history: [] })
    case 'exit':
      return { exit: true, output: 'Exiting CodeMind Operator Workspace.', session }
  }
}

function recordInput(
  session: OperatorSessionState,
  parsed: Exclude<ParsedOperatorInput, { kind: 'empty' }>,
  historyStore?: OperatorHistoryStore,
): OperatorSessionState {
  const entry: OperatorHistoryEntry = {
    timestamp: new Date().toISOString(),
    input: parsed.raw.trim(),
    kind: parsed.kind,
  }
  historyStore?.append(entry)
  return { ...session, history: [...session.history, entry] }
}

async function requireText(
  value: string,
  usage: string,
  renderer: (value: string, cwd: string) => Promise<string>,
  cwd: string,
): Promise<string> {
  if (value.length === 0) {
    return usage
  }
  return renderer(value, cwd)
}

function continueWith(output: string, session: OperatorSessionState): OperatorCommandResult {
  return { exit: false, output, session }
}
