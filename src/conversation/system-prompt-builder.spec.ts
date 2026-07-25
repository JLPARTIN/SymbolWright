import { describe, expect, it } from 'vitest'

import { buildSystemPrompt } from './system-prompt-builder.js'

describe('system-prompt-builder', () => {
  it('returns base identity with no context', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('SymbolWright')
    expect(prompt).toContain('coding agent')
    expect(prompt.toLowerCase()).toContain('governance')
  })

  it('includes project name', () => {
    const prompt = buildSystemPrompt({ projectName: 'MyApp' })
    expect(prompt).toContain('MyApp')
  })

  it('includes project description', () => {
    const prompt = buildSystemPrompt({
      projectName: 'MyApp',
      projectDescription: 'A web application',
    })
    expect(prompt).toContain('A web application')
  })

  it('includes languages', () => {
    const prompt = buildSystemPrompt({ languages: ['TypeScript', 'Python'] })
    expect(prompt).toContain('TypeScript')
    expect(prompt).toContain('Python')
  })

  it('includes frameworks', () => {
    const prompt = buildSystemPrompt({ frameworks: ['React', 'Express'] })
    expect(prompt).toContain('React')
    expect(prompt).toContain('Express')
  })

  it('includes test framework', () => {
    const prompt = buildSystemPrompt({ testFramework: 'vitest' })
    expect(prompt).toContain('vitest')
  })

  it('includes available tools', () => {
    const prompt = buildSystemPrompt({
      availableTools: ['read_file', 'search_files', 'propose_edit'],
    })
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('search_files')
  })

  it('includes governance boundaries', () => {
    const prompt = buildSystemPrompt({
      governanceBoundaries: [
        'Protected paths cannot be modified without approval',
        'Network access requires policy allowance',
      ],
    })
    expect(prompt).toContain('Protected paths')
    expect(prompt).toContain('Network access')
  })

  it('includes additional context', () => {
    const prompt = buildSystemPrompt({
      additionalContext: ['This project uses ESM modules.'],
    })
    expect(prompt).toContain('ESM modules')
  })

  it('omits sections when arrays are empty', () => {
    const prompt = buildSystemPrompt({
      languages: [],
      frameworks: [],
      availableTools: [],
      governanceBoundaries: [],
      additionalContext: [],
    })
    expect(prompt).not.toContain('Languages:')
    expect(prompt).not.toContain('Frameworks:')
    expect(prompt).not.toContain('Available tools:')
    expect(prompt).not.toContain('Governance boundaries:')
  })

  it('combines all sections', () => {
    const prompt = buildSystemPrompt({
      projectName: 'TestProject',
      languages: ['TypeScript'],
      frameworks: ['Node.js'],
      testFramework: 'vitest',
      availableTools: ['read_file'],
      governanceBoundaries: ['Read-only mode active'],
      additionalContext: ['Additional notes here'],
    })

    expect(prompt).toContain('TestProject')
    expect(prompt).toContain('TypeScript')
    expect(prompt).toContain('Node.js')
    expect(prompt).toContain('vitest')
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('Read-only mode active')
    expect(prompt).toContain('Additional notes')
  })
})
