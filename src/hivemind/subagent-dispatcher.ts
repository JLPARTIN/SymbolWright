import type { LLMProvider } from '../provider/provider.types.js'
import { runAgentLoop } from '../agent/agent-loop.js'
import type { AgentLoopConfig } from '../agent/agent-loop.types.js'
import { assembleAgentTools } from '../runtime/tools/tool-assembly.js'
import type { RuntimeAuditEvent, RuntimeAuditLog } from '../runtime/audit/runtime-audit-log.js'
import { createAuditEvent } from '../runtime/audit/runtime-audit-log.js'
import type {
  RuntimePolicySnapshot,
  RuntimeToolContext,
  RuntimeToolDefinition,
} from '../runtime/types.js'

import {
  getSubagentDefinition,
  type SubagentDefinition,
  type SubagentName,
} from './subagent-definitions.js'
import { generateSubagentSessionId } from './subagent-session.js'

export interface SubagentDispatchRequest {
  readonly subagent: SubagentName
  readonly goal: string
  readonly parentSessionId: string
  /** Off by default. Grants exactly the dispatched worker's governedTools when true. */
  readonly enableGovernedTools?: boolean
  readonly maxIterations?: number
}

/** The subagent's own structured self-report, best-effort parsed from its final text. */
export interface SubagentResult {
  readonly findings: readonly string[]
  readonly evidence: readonly string[]
  readonly risks: readonly string[]
  readonly rawOutput: string
}

export type SubagentDispatchStatus = 'completed' | 'blocked' | 'error'

/** Evidence-shaped result of one subagent_run dispatch. */
export interface SubagentDispatchEvidence {
  readonly tool: 'subagent_run'
  readonly subagent: SubagentName
  readonly status: SubagentDispatchStatus
  readonly parentSessionId: string
  readonly childSessionId: string
  readonly governedToolsEnabled: boolean
  readonly toolsUsed: readonly string[]
  readonly iterationCount: number
  readonly tokenUsage: { readonly inputTokens: number; readonly outputTokens: number }
  readonly result: SubagentResult
  readonly reason?: string
  readonly durationMs: number
  readonly auditTrace: readonly RuntimeAuditEvent[]
}

function emptySubagentResult(): SubagentResult {
  return { findings: [], evidence: [], risks: [], rawOutput: '' }
}

const SECTION_HEADER_PATTERNS: Readonly<Record<keyof Omit<SubagentResult, 'rawOutput'>, RegExp>> = {
  findings: /^#{1,3}\s*findings\s*$/i,
  evidence: /^#{1,3}\s*evidence\s*$/i,
  risks: /^#{1,3}\s*risks?\s*$/i,
}

/**
 * Best-effort parse of the subagent's freeform final text into findings/
 * evidence/risks, using the `## Findings` / `## Evidence` / `## Risks`
 * headers every subagent is instructed to produce. When the model doesn't
 * follow that structure, the raw text is preserved as a single finding
 * rather than fabricating a breakdown that isn't there.
 */
export function parseSubagentResult(rawOutput: string): SubagentResult {
  const sections: Record<'findings' | 'evidence' | 'risks', string[]> = {
    findings: [],
    evidence: [],
    risks: [],
  }
  let current: keyof typeof sections | undefined

  for (const rawLine of rawOutput.split('\n')) {
    const line = rawLine.trim()
    const matchedHeader = (Object.keys(SECTION_HEADER_PATTERNS) as (keyof typeof sections)[]).find(
      (key) => SECTION_HEADER_PATTERNS[key].test(line),
    )

    if (matchedHeader !== undefined) {
      current = matchedHeader
      continue
    }

    if (current === undefined || line.length === 0) continue

    const bulletMatch = /^[-*]\s+(.*)$/.exec(line)
    sections[current].push(bulletMatch !== null ? bulletMatch[1]! : line)
  }

  const structured = sections.findings.length + sections.evidence.length + sections.risks.length > 0

  return {
    findings: structured
      ? sections.findings
      : rawOutput.trim().length > 0
        ? [rawOutput.trim()]
        : [],
    evidence: sections.evidence,
    risks: sections.risks,
    rawOutput,
  }
}

function buildSubagentSystemPrompt(definition: SubagentDefinition): string {
  return definition.systemPromptSuffix
}

/** Isolation, not policy-blocking: the child only ever sees the tools it's actually entitled to. */
function buildChildToolset(
  definition: SubagentDefinition,
  governedToolsEnabled: boolean,
): readonly RuntimeToolDefinition[] {
  const allowedNames = new Set<string>(definition.allowedTools)
  if (governedToolsEnabled) {
    for (const name of definition.governedTools) allowedNames.add(name)
  }
  return assembleAgentTools().filter((tool) => allowedNames.has(tool.name))
}

/** Exported so its read-only enforcement can be asserted directly, without a throwaway spy. */
export function buildChildPolicy(
  parentPolicy: RuntimePolicySnapshot,
  governedToolsEnabled: boolean,
): RuntimePolicySnapshot {
  if (governedToolsEnabled) {
    // Governance turned on for this dispatch: the now-allowed tools must actually work,
    // so the child inherits the parent's real capabilities.
    return parentPolicy
  }

  return {
    ...parentPolicy,
    mode: 'READ_ONLY',
    allowShell: false,
    allowWrites: false,
    allowGitHubWrites: false,
  }
}

export function buildChildContext(
  parentContext: RuntimeToolContext,
  childSessionId: string,
  governedToolsEnabled: boolean,
): RuntimeToolContext {
  return {
    cwd: parentContext.cwd,
    policy: buildChildPolicy(parentContext.policy, governedToolsEnabled),
    sessionId: childSessionId,
    ...(parentContext.memoryTools !== undefined ? { memoryTools: parentContext.memoryTools } : {}),
    ...(parentContext.workspace !== undefined ? { workspace: parentContext.workspace } : {}),
    ...(parentContext.embeddingProvider !== undefined
      ? { embeddingProvider: parentContext.embeddingProvider }
      : {}),
    ...(parentContext.untrustedRepositoryContent === undefined
      ? {}
      : { untrustedRepositoryContent: parentContext.untrustedRepositoryContent }),
    ...(governedToolsEnabled && parentContext.sandboxRunner !== undefined
      ? { sandboxRunner: parentContext.sandboxRunner }
      : {}),
    ...(governedToolsEnabled && parentContext.sandboxFileWriter !== undefined
      ? { sandboxFileWriter: parentContext.sandboxFileWriter }
      : {}),
    ...(governedToolsEnabled && parentContext.sandboxService !== undefined
      ? { sandboxService: parentContext.sandboxService }
      : {}),
    ...(governedToolsEnabled && parentContext.sandboxAuthorization !== undefined
      ? { sandboxAuthorization: parentContext.sandboxAuthorization }
      : {}),
    ...(governedToolsEnabled && parentContext.recordSandboxExecution !== undefined
      ? { recordSandboxExecution: parentContext.recordSandboxExecution }
      : {}),
    ...(governedToolsEnabled && parentContext.githubClients !== undefined
      ? { githubClients: parentContext.githubClients }
      : {}),
    ...(governedToolsEnabled && parentContext.approval !== undefined
      ? { approval: parentContext.approval }
      : {}),
    ...(governedToolsEnabled && parentContext.accessControl !== undefined
      ? { accessControl: parentContext.accessControl }
      : {}),
  }
}

/**
 * Dispatches one isolated, read-only-by-default subagent run: real tool-list
 * filtering (the child never sees a withheld tool, not just gets blocked
 * calling it), a hard read-only policy unless governance is explicitly
 * enabled, a fresh real child session id linked to the parent, and a
 * structured findings/evidence/risks result alongside the raw text.
 */
export async function dispatchSubagent(
  provider: LLMProvider,
  parentContext: RuntimeToolContext,
  request: SubagentDispatchRequest,
  auditLog?: RuntimeAuditLog,
): Promise<SubagentDispatchEvidence> {
  const startedAtMs = Date.now()
  const action = `subagent_run:${request.subagent}`
  const auditTrace: RuntimeAuditEvent[] = []

  const record = (event: RuntimeAuditEvent): void => {
    auditTrace.push(event)
    auditLog?.record(event)
  }

  const finish = (
    status: SubagentDispatchStatus,
    childSessionId: string,
    governedToolsEnabled: boolean,
    toolsUsed: readonly string[],
    iterationCount: number,
    tokenUsage: { readonly inputTokens: number; readonly outputTokens: number },
    result: SubagentResult,
    reason?: string,
  ): SubagentDispatchEvidence => ({
    tool: 'subagent_run',
    subagent: request.subagent,
    status,
    parentSessionId: request.parentSessionId,
    childSessionId,
    governedToolsEnabled,
    toolsUsed,
    iterationCount,
    tokenUsage,
    result,
    ...(reason !== undefined ? { reason } : {}),
    durationMs: Date.now() - startedAtMs,
    auditTrace,
  })

  const definition = getSubagentDefinition(request.subagent)
  if (definition === undefined) {
    const message = `Unknown subagent: ${request.subagent}`
    record(createAuditEvent({ action, status: 'blocked', detail: message }))
    return finish(
      'blocked',
      '',
      false,
      [],
      0,
      { inputTokens: 0, outputTokens: 0 },
      emptySubagentResult(),
      message,
    )
  }

  const governedToolsEnabled = request.enableGovernedTools ?? false
  const childSessionId = generateSubagentSessionId()
  const childTools = buildChildToolset(definition, governedToolsEnabled)
  const childContext = buildChildContext(parentContext, childSessionId, governedToolsEnabled)

  const loopConfig: AgentLoopConfig = {
    maxIterations: request.maxIterations ?? 15,
    systemPrompt: buildSubagentSystemPrompt(definition),
  }

  const loopResult = await runAgentLoop(
    provider,
    request.goal,
    childTools,
    childContext,
    loopConfig,
  )

  // Ground truth for "used" is real availability, not merely a call the model attempted --
  // agent-loop records every requested call, including ones rejected as unknown-tool when
  // the model reaches for something outside the child's allowlist.
  const childToolNames = new Set<string>(childTools.map((tool) => tool.name))
  const toolsUsed = [
    ...new Set(loopResult.iterations.flatMap((iter) => iter.toolCalls.map((c) => c.name))),
  ].filter((name) => childToolNames.has(name))
  const result = parseSubagentResult(loopResult.finalText)
  const status: SubagentDispatchStatus = loopResult.status === 'completed' ? 'completed' : 'error'

  record(
    createAuditEvent({
      action,
      status: 'allowed',
      detail:
        status === 'completed'
          ? `${request.subagent} completed in ${loopResult.totalIterations} iteration(s) using [${toolsUsed.join(', ')}]`
          : `${request.subagent} ended with status=${loopResult.status}${loopResult.error !== undefined ? `: ${loopResult.error}` : ''}`,
    }),
  )

  return finish(
    status,
    childSessionId,
    governedToolsEnabled,
    toolsUsed,
    loopResult.totalIterations,
    {
      inputTokens: loopResult.totalUsage.inputTokens,
      outputTokens: loopResult.totalUsage.outputTokens,
    },
    result,
    loopResult.error,
  )
}

/** Bundles a provider + parent context + parent session id for repeated dispatch calls. */
export class SubagentDispatcher {
  constructor(
    private readonly provider: LLMProvider,
    private readonly parentContext: RuntimeToolContext,
    private readonly parentSessionId: string,
    private readonly auditLog?: RuntimeAuditLog,
  ) {}

  async dispatch(
    request: Omit<SubagentDispatchRequest, 'parentSessionId'>,
  ): Promise<SubagentDispatchEvidence> {
    return dispatchSubagent(
      this.provider,
      this.parentContext,
      { ...request, parentSessionId: this.parentSessionId },
      this.auditLog,
    )
  }
}
