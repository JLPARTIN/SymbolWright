import { findLanguageDefinition, getDefaultWorkspaceLanguageId } from './language-registry.js'
import type { CodeLanguageDefinition } from './language-registry.js'

export const CODE_INTELLIGENCE_TASK_KINDS = [
  'generate',
  'explain',
  'translate',
  'review',
  'propose-tests',
  'compare-semantic-drift',
] as const

export type CodeIntelligenceTaskKind = (typeof CODE_INTELLIGENCE_TASK_KINDS)[number]
export type CodeTranslationVerificationStatus = 'UNVERIFIED' | 'TESTED' | 'FAILED'

export type CodeIntelligenceTaskRequest = {
  kind: CodeIntelligenceTaskKind
  code?: string
  sourceLanguageId?: string
  targetLanguageId?: string
  selectedLanguageId?: string
  humanGoal?: string
  verificationStatus?: CodeTranslationVerificationStatus
}

export type CodeIntelligenceTaskPlan = {
  kind: CodeIntelligenceTaskKind
  sourceLanguage: CodeLanguageDefinition
  targetLanguage: CodeLanguageDefinition | undefined
  prompt: string
  steps: string[]
  assumptions: string[]
  semanticRisks: string[]
  verificationStatus: CodeTranslationVerificationStatus
}

export function createCodeIntelligenceTaskPlan(
  request: CodeIntelligenceTaskRequest,
): CodeIntelligenceTaskPlan {
  const sourceLanguage = resolveSourceLanguage(request)
  const targetLanguage = resolveTargetLanguage(request)
  const verificationStatus = request.verificationStatus ?? 'UNVERIFIED'

  if (request.kind === 'translate') {
    const translationTargetLanguage =
      targetLanguage ?? resolveDefaultTranslationTarget(sourceLanguage)
    return {
      kind: request.kind,
      sourceLanguage,
      targetLanguage: translationTargetLanguage,
      prompt: buildTranslationPrompt(
        request,
        sourceLanguage,
        translationTargetLanguage,
        verificationStatus,
      ),
      steps: [
        `Detected source language: ${sourceLanguage.label}.`,
        `Target language: ${translationTargetLanguage.label}.`,
        'Extract behavior and externally visible side effects before generating code.',
        'Generate target implementation without claiming equivalence yet.',
        'Generate target-language tests from the extracted behavior/specification.',
        'Report semantic risks, assumptions, unsupported APIs, and runtime differences.',
        `Mark translation verification as ${verificationStatus}.`,
      ],
      assumptions: buildAssumptions(request, sourceLanguage, translationTargetLanguage),
      semanticRisks: buildSemanticRisks(sourceLanguage, translationTargetLanguage),
      verificationStatus,
    }
  }

  return {
    kind: request.kind,
    sourceLanguage,
    targetLanguage,
    prompt: buildGeneralPrompt(request, sourceLanguage, targetLanguage, verificationStatus),
    steps: buildGeneralSteps(request.kind, sourceLanguage, targetLanguage),
    assumptions: buildAssumptions(request, sourceLanguage, targetLanguage),
    semanticRisks:
      request.kind === 'compare-semantic-drift'
        ? buildSemanticRisks(sourceLanguage, targetLanguage)
        : [],
    verificationStatus,
  }
}

export function detectSourceLanguageId(code: string): string {
  const trimmed = code.trim()

  if (/^\s*<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<style[\s>]/i.test(trimmed)) {
    return 'html'
  }

  if (/^\s*(type|interface)\s+[A-Z_a-z]/m.test(trimmed) || /:\s*(string|number|boolean)\b/.test(trimmed)) {
    return 'typescript'
  }

  if (/^\s*def\s+[A-Za-z_][A-Za-z0-9_]*\(/m.test(trimmed) || /^\s*print\(/m.test(trimmed)) {
    return 'python'
  }

  if (/^\s*SELECT\s+/im.test(trimmed) || /^\s*WITH\s+/im.test(trimmed)) {
    return 'sql'
  }

  if (/^\s*fn\s+main\s*\(/m.test(trimmed)) {
    return 'rust'
  }

  if (/^\s*package\s+main\b/m.test(trimmed)) {
    return 'go'
  }

  if (/^\s*#include\s+</m.test(trimmed)) {
    return 'cpp'
  }

  if (/^\s*\{/m.test(trimmed) && /"[^"]+"\s*:/.test(trimmed)) {
    return 'json'
  }

  return 'javascript'
}

function resolveSourceLanguage(request: CodeIntelligenceTaskRequest): CodeLanguageDefinition {
  const explicit = request.sourceLanguageId ?? request.selectedLanguageId
  const detected =
    request.code === undefined
      ? getDefaultWorkspaceLanguageId()
      : detectSourceLanguageId(request.code)
  const language = findLanguageDefinition(explicit ?? detected) ?? findLanguageDefinition(detected)

  if (language === undefined) {
    throw new Error(`Unable to resolve source language for ${explicit ?? detected}`)
  }

  return language
}

function resolveTargetLanguage(
  request: CodeIntelligenceTaskRequest,
): CodeLanguageDefinition | undefined {
  const targetId = request.targetLanguageId ?? request.selectedLanguageId

  if (targetId === undefined) {
    return undefined
  }

  return findLanguageDefinition(targetId)
}

function resolveDefaultTranslationTarget(sourceLanguage: CodeLanguageDefinition): CodeLanguageDefinition {
  const fallbackId = sourceLanguage.id === 'typescript' ? 'javascript' : 'typescript'
  const language = findLanguageDefinition(fallbackId)

  if (language === undefined) {
    throw new Error(`Unable to resolve default translation target: ${fallbackId}`)
  }

  return language
}

function buildTranslationPrompt(
  request: CodeIntelligenceTaskRequest,
  sourceLanguage: CodeLanguageDefinition,
  targetLanguage: CodeLanguageDefinition | undefined,
  verificationStatus: CodeTranslationVerificationStatus,
): string {
  const targetLabel = targetLanguage?.label ?? 'the selected target language'
  const goal = request.humanGoal ?? 'Translate the source code while preserving behavior.'

  return [
    `Task: ${goal}`,
    `Source language: ${sourceLanguage.label}`,
    `Target language: ${targetLabel}`,
    'Required flow:',
    '1. Detect source language.',
    '2. Confirm or infer target language from the workspace dropdown.',
    '3. Extract behavior/specification.',
    '4. Generate target implementation.',
    '5. Generate target-language tests.',
    '6. Show semantic risks and assumptions.',
    `7. Mark result as ${verificationStatus}; never claim equivalence unless tests actually run.`,
  ].join('\n')
}

function buildGeneralPrompt(
  request: CodeIntelligenceTaskRequest,
  sourceLanguage: CodeLanguageDefinition,
  targetLanguage: CodeLanguageDefinition | undefined,
  verificationStatus: CodeTranslationVerificationStatus,
): string {
  const goal = request.humanGoal ?? `Perform ${request.kind} for the selected code.`
  const lines = [`Task: ${goal}`, `Language: ${sourceLanguage.label}`]

  if (targetLanguage !== undefined) {
    lines.push(`Target language: ${targetLanguage.label}`)
  }

  lines.push(`Verification status: ${verificationStatus}`)
  return lines.join('\n')
}

function buildGeneralSteps(
  kind: CodeIntelligenceTaskKind,
  sourceLanguage: CodeLanguageDefinition,
  targetLanguage: CodeLanguageDefinition | undefined,
): string[] {
  if (kind === 'generate') {
    return [
      `Generate code in ${targetLanguage?.label ?? sourceLanguage.label}.`,
      'Prefer small, testable functions over broad scaffolding.',
      'State external dependencies and runtime assumptions.',
    ]
  }

  if (kind === 'review') {
    return [
      `Review ${sourceLanguage.label} code for bugs, unsafe behavior, and missing tests.`,
      'Separate confirmed issues from risks and style suggestions.',
    ]
  }

  if (kind === 'propose-tests') {
    return [
      `Infer behavior from ${sourceLanguage.label} code.`,
      'Propose deterministic unit tests and edge cases.',
      'Do not claim tests passed until a runner executes them.',
    ]
  }

  if (kind === 'compare-semantic-drift') {
    return [
      `Compare ${sourceLanguage.label} behavior with ${targetLanguage?.label ?? 'target'} behavior.`,
      'Call out runtime/library/type-system differences.',
      'Return UNVERIFIED unless the equivalence harness runs.',
    ]
  }

  return [
    `Explain ${sourceLanguage.label} code in plain language.`,
    'Identify inputs, outputs, side effects, and failure modes.',
  ]
}

function buildAssumptions(
  request: CodeIntelligenceTaskRequest,
  sourceLanguage: CodeLanguageDefinition,
  targetLanguage: CodeLanguageDefinition | undefined,
): string[] {
  const assumptions = [
    `Source capability is ${sourceLanguage.capability}.`,
    'AI assistance can draft or review code, but only real registered runners can verify execution.',
  ]

  if (targetLanguage !== undefined) {
    assumptions.push(`Target capability is ${targetLanguage.capability}.`)
  }

  if (request.code === undefined || request.code.trim().length === 0) {
    assumptions.push(
      'No source code was supplied, so generation must rely on the user goal/specification.',
    )
  }

  return assumptions
}

function buildSemanticRisks(
  sourceLanguage: CodeLanguageDefinition,
  targetLanguage: CodeLanguageDefinition | undefined,
): string[] {
  if (targetLanguage === undefined) {
    return ['Target language is unresolved, so semantic equivalence cannot be assessed.']
  }

  if (sourceLanguage.id === targetLanguage.id) {
    return [
      'Source and target languages match; risk is refactor drift rather than cross-language runtime drift.',
    ]
  }

  return [
    `Runtime/library differences between ${sourceLanguage.label} and ${targetLanguage.label}.`,
    'Integer, floating-point, Unicode, timezone, and collection-order semantics may differ.',
    'Equivalent-looking APIs can differ in error handling and edge cases.',
    'Verification remains UNVERIFIED until generated tests run successfully.',
  ]
}
