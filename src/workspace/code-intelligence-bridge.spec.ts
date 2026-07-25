import { describe, expect, it } from 'vitest'

import {
  buildWorkspaceIntelligencePrompt,
  createWorkspaceCodeIntelligenceBridgeResponse,
  parseWorkspaceCodeIntelligenceRequest,
} from './code-intelligence-bridge.js'
import { createCodeIntelligenceTaskPlan } from './code-intelligence-router.js'

describe('workspace code intelligence chat bridge', () => {
  it('parses valid workspace requests and preserves context fields', () => {
    const request = parseWorkspaceCodeIntelligenceRequest({
      kind: 'review',
      code: 'console.log(1)',
      sourceLanguageId: 'javascript',
      diagnostics: 'Browser Worker only',
      output: '1',
      errors: '',
    })

    expect(request.kind).toBe('review')
    expect(request.code).toBe('console.log(1)')
    expect(request.sourceLanguageId).toBe('javascript')
    expect(request.diagnostics).toBe('Browser Worker only')
    expect(request.output).toBe('1')
    expect(request.errors).toBeUndefined()
  })

  it('rejects malformed bridge requests', () => {
    expect(() => parseWorkspaceCodeIntelligenceRequest(null)).toThrow(
      'Workspace code-intelligence request must be a JSON object.',
    )
    expect(() => parseWorkspaceCodeIntelligenceRequest({ kind: 'nope', code: '' })).toThrow(
      'Unsupported code-intelligence task kind',
    )
    expect(() => parseWorkspaceCodeIntelligenceRequest({ kind: 'review' })).toThrow('requires code')
  })

  it('caps oversized code and long context fields', () => {
    expect(() =>
      parseWorkspaceCodeIntelligenceRequest({ kind: 'review', code: 'x'.repeat(24_001) }),
    ).toThrow('exceeds 24000 characters')

    const request = parseWorkspaceCodeIntelligenceRequest({
      kind: 'review',
      code: 'console.log(1)',
      diagnostics: 'd'.repeat(8_010),
    })

    expect(request.diagnostics).toContain('[truncated at 8000 characters]')
  })

  it('creates a chat-ready prompt and safe suggested agent mode for read-only tasks', () => {
    const response = createWorkspaceCodeIntelligenceBridgeResponse({
      kind: 'review',
      code: 'console.log(1)',
      sourceLanguageId: 'javascript',
      output: '1',
    })

    expect(response.ok).toBe(true)
    expect(response.suggestedAgentMode).toBe('READ_ONLY')
    expect(response.chatDraft.summary).toBe('review · JavaScript · UNVERIFIED')
    expect(response.prompt).toContain('# SymbolWright Workspace Code Intelligence Task')
    expect(response.prompt).toContain('## Last run output')
    expect(response.prompt).toContain('Do not claim execution success')
  })

  it('suggests proposal mode for generation and translation tasks', () => {
    const response = createWorkspaceCodeIntelligenceBridgeResponse({
      kind: 'translate',
      code: 'const x = 1',
      sourceLanguageId: 'javascript',
      targetLanguageId: 'typescript',
    })

    expect(response.suggestedAgentMode).toBe('PROPOSAL_ONLY')
    expect(response.chatDraft.summary).toBe('translate · JavaScript -> TypeScript · UNVERIFIED')
    expect(response.prompt).toContain('Target language: TypeScript')
  })

  it('builds prompts with diagnostics, errors, safety notes, and fenced code', () => {
    const plan = createCodeIntelligenceTaskPlan({
      kind: 'explain',
      sourceLanguageId: 'python',
      code: 'print("hi")',
    })
    const prompt = buildWorkspaceIntelligencePrompt(
      {
        kind: 'explain',
        sourceLanguageId: 'python',
        code: 'print("hi")',
        diagnostics: 'Pyodide browser runtime is configured but has not run yet.',
        errors: 'No execution evidence yet.',
      },
      plan,
    )

    expect(prompt).toContain('Runner: browser-pyodide')
    expect(prompt).toContain('Pyodide browser runtime is configured')
    expect(prompt).toContain('## Last run errors')
    expect(prompt).toContain('```python')
  })
})
