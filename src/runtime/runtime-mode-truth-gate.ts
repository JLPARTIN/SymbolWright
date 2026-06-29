import fs from 'node:fs'
import path from 'node:path'

import { buildUnifiedSystemPrompt } from '../conversation/unified-system-prompt.js'
import {
  CODEMIND_RUNTIME_MODES,
  DEFAULT_CODEMIND_RUNTIME_MODE,
  createDefaultRuntimePolicy,
  normalizeCodemindRuntimeMode,
} from './policy/runtime-policy.js'

export type RuntimeModeTruthStatus = 'PASS' | 'FAIL'

export interface RuntimeModeTruthReport {
  readonly status: RuntimeModeTruthStatus
  readonly findings: readonly string[]
}

interface RequiredPhraseCheck {
  readonly filePath: string
  readonly phrases: readonly string[]
}

interface BannedPhraseCheck {
  readonly filePath: string
  readonly phrases: readonly string[]
}

const REQUIRED_RUNTIME_MODES = [
  'PLAN_ONLY',
  'READ_ONLY',
  'PROPOSAL_ONLY',
  'APPROVED_EXECUTION',
] as const

const REQUIRED_PHRASES: readonly RequiredPhraseCheck[] = [
  {
    filePath: 'README.md',
    phrases: [
      'direct-capable coding-agent platform',
      'APPROVED_EXECUTION is the direct execution mode',
      'CODEMIND_RUNTIME_MODE=APPROVED_EXECUTION',
      'Governance is optional by mode',
    ],
  },
  {
    filePath: path.join('docs', 'governance', 'CODEMIND_PERMISSION_MODEL.md'),
    phrases: [
      'Governance is a feature, not the default personality',
      '`APPROVED_EXECUTION` is the direct execution mode',
      'direct-capable by runtime mode',
    ],
  },
  {
    filePath: path.join('docs', 'governance', 'CODEMIND_THREAT_MODEL.md'),
    phrases: [
      'This document does not make CodeMind read-only by default',
      '`APPROVED_EXECUTION` is direct-capable',
      'CodeMind may execute directly in `APPROVED_EXECUTION`',
    ],
  },
]

const BANNED_STALE_PHRASES: readonly BannedPhraseCheck[] = [
  {
    filePath: 'README.md',
    phrases: [
      'read-only and plan-first by default',
      'proposal-only before execution',
      'approval ticket required for gated execution',
      'no network by default',
      'no file writes without operator approval',
      'no shell execution without operator approval',
      'No approval ticket means approved execution fails',
    ],
  },
  {
    filePath: path.join('docs', 'governance', 'CODEMIND_PERMISSION_MODEL.md'),
    phrases: [
      'No write-capable mode should be active by default',
      'CodeMind must never assume permission',
      'write requires approval',
      'commands require approval',
      'disable governance',
      'unrestricted shell',
      'silent file edits',
    ],
  },
  {
    filePath: path.join('docs', 'governance', 'CODEMIND_THREAT_MODEL.md'),
    phrases: [
      'Generated output is proposal-only until validated and approved by policy gates',
      'Approval must come from the explicit operator channel and policy gates',
      'active policy gate',
    ],
  },
]

function readWorkspaceFile(workspaceRoot: string, filePath: string): string | undefined {
  const absolutePath = path.join(workspaceRoot, filePath)
  if (!fs.existsSync(absolutePath)) {
    return undefined
  }
  return fs.readFileSync(absolutePath, 'utf8')
}

function includesAllRuntimeModes(content: string): boolean {
  return REQUIRED_RUNTIME_MODES.every((mode) => content.includes(mode))
}

function collectRequiredPhraseFindings(workspaceRoot: string): string[] {
  const findings: string[] = []

  for (const check of REQUIRED_PHRASES) {
    const content = readWorkspaceFile(workspaceRoot, check.filePath)
    if (content === undefined) {
      findings.push(`${check.filePath} missing`)
      continue
    }

    if (!includesAllRuntimeModes(content)) {
      findings.push(`${check.filePath} must document all canonical runtime modes`)
    }

    for (const phrase of check.phrases) {
      if (!content.includes(phrase)) {
        findings.push(`${check.filePath} missing runtime truth phrase: ${phrase}`)
      }
    }
  }

  return findings
}

function collectBannedPhraseFindings(workspaceRoot: string): string[] {
  const findings: string[] = []

  for (const check of BANNED_STALE_PHRASES) {
    const content = readWorkspaceFile(workspaceRoot, check.filePath)
    if (content === undefined) {
      continue
    }

    for (const phrase of check.phrases) {
      if (content.includes(phrase)) {
        findings.push(`${check.filePath} contains stale runtime posture phrase: ${phrase}`)
      }
    }
  }

  return findings
}

function collectRuntimePolicyFindings(): string[] {
  const findings: string[] = []
  const policy = createDefaultRuntimePolicy()

  if (DEFAULT_CODEMIND_RUNTIME_MODE !== 'APPROVED_EXECUTION') {
    findings.push('default runtime mode must remain APPROVED_EXECUTION')
  }

  for (const mode of REQUIRED_RUNTIME_MODES) {
    if (!(CODEMIND_RUNTIME_MODES as readonly string[]).includes(mode)) {
      findings.push(`canonical runtime mode missing from policy: ${mode}`)
    }
  }

  if (policy.mode !== 'APPROVED_EXECUTION') {
    findings.push('default runtime policy must resolve to APPROVED_EXECUTION')
  }
  if (!policy.allowNetwork) {
    findings.push('APPROVED_EXECUTION default policy must allow network/provider access')
  }
  if (!policy.allowShell) {
    findings.push('APPROVED_EXECUTION default policy must allow shell execution')
  }
  if (!policy.allowWrites) {
    findings.push('APPROVED_EXECUTION default policy must allow local writes')
  }
  if (!policy.allowGitHubWrites) {
    findings.push(
      'APPROVED_EXECUTION default policy must allow GitHub writes when token is available',
    )
  }

  if (normalizeCodemindRuntimeMode('direct') !== 'APPROVED_EXECUTION') {
    findings.push('direct alias must normalize to APPROVED_EXECUTION')
  }
  if (normalizeCodemindRuntimeMode('off') !== 'APPROVED_EXECUTION') {
    findings.push('off alias must normalize to APPROVED_EXECUTION')
  }
  if (normalizeCodemindRuntimeMode('approved') !== 'APPROVED_EXECUTION') {
    findings.push('approved alias must normalize to APPROVED_EXECUTION')
  }

  return findings
}

function collectPromptFindings(): string[] {
  const findings: string[] = []
  const prompt = buildUnifiedSystemPrompt({
    permissionMode: 'APPROVED_EXECUTION',
  })

  if (!prompt.includes('perform direct implementation work')) {
    findings.push(
      'APPROVED_EXECUTION prompt must tell CodeMind to perform direct implementation work',
    )
  }
  if (!prompt.includes('Direct file edits')) {
    findings.push('APPROVED_EXECUTION prompt must explicitly allow direct file edits')
  }
  if (!prompt.includes('Prefer useful completed work over approval theater')) {
    findings.push('APPROVED_EXECUTION prompt must reject approval-theater behavior')
  }
  if (prompt.includes('All mutations require approval')) {
    findings.push('APPROVED_EXECUTION prompt must not say all mutations require approval')
  }

  return findings
}

/**
 * Release-readiness guard that prevents CodeMind from drifting back into a
 * default read-only / approval-first posture after direct runtime mode support.
 */
export function assessRuntimeModeTruth(workspaceRoot: string): RuntimeModeTruthReport {
  const findings = [
    ...collectRuntimePolicyFindings(),
    ...collectPromptFindings(),
    ...collectRequiredPhraseFindings(workspaceRoot),
    ...collectBannedPhraseFindings(workspaceRoot),
  ]

  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings,
  }
}
