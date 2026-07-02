import {
  getCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from './checkpoint/checkpoint-service.js'
import {
  createRuntimePolicyForMode,
  DEFAULT_CODEMIND_RUNTIME_MODE,
} from './runtime/policy/runtime-policy.js'

interface ParsedCheckpointFlags {
  readonly positionals: readonly string[]
  readonly sessionId?: string
  readonly json: boolean
}

function parseCheckpointFlags(args: readonly string[]): ParsedCheckpointFlags {
  const positionals: string[] = []
  let sessionId: string | undefined
  let json = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--session') {
      sessionId = args[++i]
      continue
    }
    if (arg === '--json') {
      json = true
      continue
    }
    if (arg !== undefined) {
      positionals.push(arg)
    }
  }

  return { positionals, ...(sessionId !== undefined ? { sessionId } : {}), json }
}

export function renderCheckpointListCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): string {
  const flags = parseCheckpointFlags(args)
  const checkpoints = listCheckpoints(cwd, flags.sessionId)

  if (flags.json) {
    return JSON.stringify(checkpoints, null, 2)
  }

  if (checkpoints.length === 0) {
    return [
      'CodeMind checkpoints',
      '',
      'No checkpoints found. Checkpoints are created automatically before edit_file,',
      'local_file_write, and apply_patch mutate a file.',
    ].join('\n')
  }

  const lines = ['CodeMind checkpoints', '']
  for (const checkpoint of checkpoints) {
    lines.push(
      `- ${checkpoint.checkpointId}  [${checkpoint.tool}]  ${checkpoint.createdAt}  ` +
        `session=${checkpoint.sessionId}  files=${checkpoint.fileCount}` +
        (checkpoint.reason !== undefined ? `  reason="${checkpoint.reason}"` : ''),
    )
  }

  return lines.join('\n')
}

export function renderCheckpointShowCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): string {
  const flags = parseCheckpointFlags(args)
  const checkpointId = flags.positionals[0]
  if (checkpointId === undefined) {
    throw new Error('Usage: codemind checkpoint show <id> [--json]')
  }

  const metadata = getCheckpoint(cwd, checkpointId)
  if (metadata === undefined) {
    throw new Error(`Checkpoint not found: ${checkpointId}`)
  }

  if (flags.json) {
    return JSON.stringify(metadata, null, 2)
  }

  const lines = [
    'CodeMind checkpoint',
    '',
    `Checkpoint: ${metadata.checkpointId}`,
    `Session:    ${metadata.sessionId}`,
    `Tool:       ${metadata.tool}`,
    `Created:    ${metadata.createdAt}`,
    ...(metadata.reason !== undefined ? [`Reason:     ${metadata.reason}`] : []),
    '',
    'Files:',
  ]

  for (const file of metadata.files) {
    lines.push(
      `- ${file.targetPath}` +
        (file.existedBefore
          ? `  (existed, hash=${file.originalHash ?? 'unknown'})`
          : '  (new file — restore deletes it)'),
    )
  }

  if (metadata.restores.length > 0) {
    lines.push('', 'Restore history:')
    for (const restore of metadata.restores) {
      lines.push(
        `- ${restore.restoredAt}: ${Object.keys(restore.restoredFileHashes).length} file(s)`,
      )
    }
  }

  return lines.join('\n')
}

export function renderCheckpointRestoreCommand(
  args: readonly string[],
  cwd: string = process.cwd(),
): string {
  const flags = parseCheckpointFlags(args)
  const checkpointId = flags.positionals[0]
  if (checkpointId === undefined) {
    throw new Error('Usage: codemind checkpoint restore <id> [--json]')
  }

  const policy = createRuntimePolicyForMode(DEFAULT_CODEMIND_RUNTIME_MODE)
  const evidence = restoreCheckpoint({ workspaceRoot: cwd, checkpointId, policy })

  if (flags.json) {
    return JSON.stringify(evidence, null, 2)
  }

  const lines = [
    'CodeMind checkpoint restore',
    '',
    `Checkpoint: ${evidence.checkpointId}`,
    `Status:     ${evidence.status}`,
    `Duration:   ${evidence.durationMs}ms`,
  ]

  if (evidence.files.length > 0) {
    lines.push('', 'Files:')
    for (const file of evidence.files) {
      lines.push(`- ${file.targetPath}: ${file.action}`)
    }
  }

  if (evidence.reason !== undefined) {
    lines.push('', `Reason: ${evidence.reason}`)
  }

  lines.push(
    '',
    'Audit trace:',
    ...evidence.auditTrace.map(
      (event) =>
        `- [${event.timestamp}] ${event.status.toUpperCase()} ${event.action}: ${event.detail}`,
    ),
  )

  return lines.join('\n')
}
