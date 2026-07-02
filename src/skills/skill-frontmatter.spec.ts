import { describe, expect, it } from 'vitest'

import { parseSkillMarkdown } from './skill-frontmatter.js'

describe('parseSkillMarkdown', () => {
  it('parses Claude-compatible YAML frontmatter fields', () => {
    const parsed = parseSkillMarkdown(`---
name: repo-forensics
description: Review the repo
when_to_use: Use for audits
argument-hint: [focus]
arguments: [issue, branch]
disable-model-invocation: true
user-invocable: false
allowed-tools:
  - read_file
  - grep
disallowed-tools: bash,git
context: fork
agent: explorer
paths: src/**/*.ts
shell: bash
---
Run for $ARGUMENTS
`)

    expect(parsed.frontmatter.name).toBe('repo-forensics')
    expect(parsed.frontmatter.description).toBe('Review the repo')
    expect(parsed.frontmatter.whenToUse).toBe('Use for audits')
    expect(parsed.frontmatter.argumentHint).toBe('[focus]')
    expect(parsed.frontmatter.arguments).toEqual(['issue', 'branch'])
    expect(parsed.frontmatter.disableModelInvocation).toBe(true)
    expect(parsed.frontmatter.userInvocable).toBe(false)
    expect(parsed.frontmatter.allowedTools).toEqual(['read_file', 'grep'])
    expect(parsed.frontmatter.disallowedTools).toEqual(['bash', 'git'])
    expect(parsed.frontmatter.context).toBe('fork')
    expect(parsed.frontmatter.agent).toBe('explorer')
    expect(parsed.frontmatter.paths).toEqual(['src/**/*.ts'])
    expect(parsed.frontmatter.shell).toBe('bash')
    expect(parsed.body).toContain('Run for')
  })

  it('rejects unknown tools instead of silently granting fantasy access', () => {
    expect(() =>
      parseSkillMarkdown(`---
description: bad
allowed-tools: made_up_tool
---
Nope
`),
    ).toThrow('Unknown tool')
  })

  it('uses the first body paragraph as a description fallback', () => {
    const parsed = parseSkillMarkdown(`# Heading

More details.`)
    expect(parsed.frontmatter.description).toBe('Heading')
  })
})
