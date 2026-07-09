import {
  CODE_INTELLIGENCE_TASK_KINDS,
  createCodeIntelligenceTaskPlan,
  type CodeIntelligenceTaskKind,
  type CodeIntelligenceTaskPlan,
  type CodeIntelligenceTaskRequest,
  type CodeTranslationVerificationStatus,
} from './code-intelligence-router.js'
import { findLanguageDefinition } from './language-registry.js'

export type WorkspaceCodeIntelligenceBridgeRequest = {
  kind: CodeIntelligenceTaskKind
  code: string
  sourceLanguageId?: string
  targetLanguageId?: string
  selectedLanguageId?: string
  diagnostics?: string
  output?: string
  errors?: string
  humanGoal?: string
  verificationStatus?: CodeTranslationVerificationStatus
}

export type WorkspaceCodeIntelligenceBridgeResponse = {
  ok: true
  plan: CodeIntelligenceTaskPlan
  prompt: string
  suggestedAgentMode: 'READ_ONLY' | 'PROPOSAL_ONLY'
  chatDraft: {
    message: string
    summary: string
  }
}

const MAX_CODE_CHARS = 24_000
const MAX_CONTEXT_CHARS = 8_000

export function parseWorkspaceCodeIntelligenceRequest(
  value: unknown,
): WorkspaceCodeIntelligenceBridgeRequest {
  if (value === null || typeof value !== 'object') {
    throw new Error('Workspace code-intelligence request must be a JSON object.')
  }

  const record = value as Record<string, unknown>
  const kind = record['kind']
  const code = record['code']
  const sourceLanguageId = optionalString(record['sourceLanguageId'])
  const targetLanguageId = optionalString(record['targetLanguageId'])
  const selectedLanguageId = optionalString(record['selectedLanguageId'])
  const diagnostics = optionalString(record['diagnostics'])
  const output = optionalString(record['output'])
  const errors = optionalString(record['errors'])
  const humanGoal = optionalString(record['humanGoal'])
  const verificationStatus = parseVerificationStatus(record['verificationStatus'])

  if (typeof kind !== 'string' || !isCodeIntelligenceTaskKind(kind)) {
    throw new Error(
      `Unsupported code-intelligence task kind. Supported kinds: ${CODE_INTELLIGENCE_TASK_KINDS.join(', ')}`,
    )
  }

  if (typeof code !== 'string') {
    throw new Error('Workspace code-intelligence request requires code.')
  }

  if (code.length > MAX_CODE_CHARS) {
    throw new Error(`Workspace code-intelligence code exceeds ${MAX_CODE_CHARS} characters.`)
  }

  const request: WorkspaceCodeIntelligenceBridgeRequest = {
    kind,
    code,
  }

  if (sourceLanguageId !== undefined) request.sourceLanguageId = sourceLanguageId
  if (targetLanguageId !== undefined) request.targetLanguageId = targetLanguageId
  if (selectedLanguageId !== undefined) request.selectedLanguageId = selectedLanguageId
  if (diagnostics !== undefined) request.diagnostics = limitText(diagnostics, MAX_CONTEXT_CHARS)
  if (output !== undefined) request.output = limitText(output, MAX_CONTEXT_CHARS)
  if (errors !== undefined) request.errors = limitText(errors, MAX_CONTEXT_CHARS)
  if (humanGoal !== undefined) request.humanGoal = humanGoal
  if (verificationStatus !== undefined) request.verificationStatus = verificationStatus

  return request
}

export function createWorkspaceCodeIntelligenceBridgeResponse(
  request: WorkspaceCodeIntelligenceBridgeRequest,
): WorkspaceCodeIntelligenceBridgeResponse {
  const planRequest: CodeIntelligenceTaskRequest = {
    kind: request.kind,
    code: request.code,
  }

  if (request.sourceLanguageId !== undefined)
    planRequest.sourceLanguageId = request.sourceLanguageId
  if (request.targetLanguageId !== undefined)
    planRequest.targetLanguageId = request.targetLanguageId
  if (request.selectedLanguageId !== undefined) {
    planRequest.selectedLanguageId = request.selectedLanguageId
  }
  if (request.humanGoal !== undefined) planRequest.humanGoal = request.humanGoal
  if (request.verificationStatus !== undefined) {
    planRequest.verificationStatus = request.verificationStatus
  }

  const plan = createCodeIntelligenceTaskPlan(planRequest)
  const prompt = buildWorkspaceIntelligencePrompt(request, plan)
  const suggestedAgentMode = chooseSuggestedAgentMode(plan.kind)

  return {
    ok: true,
    plan,
    prompt,
    suggestedAgentMode,
    chatDraft: {
      message: prompt,
      summary: `${plan.kind} · ${plan.sourceLanguage.label}${
        plan.targetLanguage === undefined ? '' : ` -> ${plan.targetLanguage.label}`
      } · ${plan.verificationStatus}`,
    },
  }
}

export function buildWorkspaceIntelligencePrompt(
  request: WorkspaceCodeIntelligenceBridgeRequest,
  plan: CodeIntelligenceTaskPlan,
): string {
  const sections = [
    '# CodeMind Workspace Code Intelligence Task',
    '',
    `Task kind: ${plan.kind}`,
    `Source language: ${plan.sourceLanguage.label} (${plan.sourceLanguage.id})`,
    `Source capability: ${plan.sourceLanguage.capability}`,
  ]

  if (plan.targetLanguage !== undefined) {
    sections.push(
      `Target language: ${plan.targetLanguage.label} (${plan.targetLanguage.id})`,
      `Target capability: ${plan.targetLanguage.capability}`,
    )
  }

  sections.push(
    `Verification status: ${plan.verificationStatus}`,
    '',
    '## Required routing plan',
    plan.prompt,
    '',
    '## Steps',
    ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    '## Assumptions',
    ...plan.assumptions.map((assumption) => `- ${assumption}`),
  )

  if (plan.semanticRisks.length > 0) {
    sections.push('', '## Semantic risks', ...plan.semanticRisks.map((risk) => `- ${risk}`))
  }

  const sourceLanguage = findLanguageDefinition(request.sourceLanguageId ?? plan.sourceLanguage.id)
  if (sourceLanguage !== undefined) {
    sections.push(
      '',
      '## Language registry notes',
      `- Runner: ${sourceLanguage.runnerId ?? 'none'}`,
      `- Safety: ${sourceLanguage.safetyRestrictions.join(' ')}`,
    )
  }

  if (request.diagnostics !== undefined && request.diagnostics.trim().length > 0) {
    sections.push('', '## Workspace diagnostics', fenced(request.diagnostics))
  }

  if (request.output !== undefined && request.output.trim().length > 0) {
    sections.push('', '## Last run output', fenced(request.output))
  }

  if (request.errors !== undefined && request.errors.trim().length > 0) {
    sections.push('', '## Last run errors', fenced(request.errors))
  }

  sections.push(
    '',
    '## Selected code',
    fenced(request.code, plan.sourceLanguage.editorLanguageId),
    '',
    'Do not claim execution success or translation equivalence unless a real CodeMind runner or test harness has produced evidence in this conversation.',
  )

  return sections.join('\n')
}

function isCodeIntelligenceTaskKind(value: string): value is CodeIntelligenceTaskKind {
  return CODE_INTELLIGENCE_TASK_KINDS.some((kind) => kind === value)
}

function parseVerificationStatus(value: unknown): CodeTranslationVerificationStatus | undefined {
  if (value === 'UNVERIFIED' || value === 'TESTED' || value === 'FAILED') {
    return value
  }

  return undefined
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : value
}

function limitText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }

  return `${value.slice(0, maxChars)}\n[truncated at ${maxChars} characters]`
}

function chooseSuggestedAgentMode(kind: CodeIntelligenceTaskKind): 'READ_ONLY' | 'PROPOSAL_ONLY' {
  if (kind === 'explain' || kind === 'review' || kind === 'compare-semantic-drift') {
    return 'READ_ONLY'
  }

  return 'PROPOSAL_ONLY'
}

function fenced(value: string, language = ''): string {
  return `\`\`\`${language}\n${value}\n\`\`\``
}
