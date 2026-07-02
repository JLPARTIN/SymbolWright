import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createRuntimePolicyForMode } from '../runtime/policy/runtime-policy.js'
import type { RuntimeToolContext } from '../runtime/types.js'
import type { SandboxRunner } from '../runtime/sandbox/sandbox-runner.js'
import { renderSkillListCommand, renderSkillShowCommand } from '../cli-skill.js'
import { runSkill } from './skill-runtime.js'

function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codemind-skill-runtime-'))
}

function writeSkill(root: string, name: string, content: string): void {
  const skillDir = path.join(root, '.codemind', 'skills', name)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content)
}

const fakeRunner: SandboxRunner = {
  runCommand: async (request) => ({
    outcome: 'EXECUTED',
    runner: 'docker',
    command: [request.binary, ...request.args].join(' '),
    stdout: 'dynamic output',
    stderr: '',
    exitCode: 0,
    reason: null,
  }),
}

describe('skill runtime', () => {
  it('renders argument substitutions and dynamic context through the runtime policy path', async () => {
    const root = tempWorkspace()
    try {
      writeSkill(
        root,
        'summarize-changes',
        `---
description: Summarize changes
arguments: [issue]
---
Issue: $issue
All: $ARGUMENTS
First: $0

!\`git status\`
`,
      )

      const context: RuntimeToolContext = {
        cwd: root,
        policy: createRuntimePolicyForMode('APPROVED_EXECUTION'),
        sandboxRunner: fakeRunner,
        sessionId: 'cm-test',
      }

      const result = await runSkill({
        cwd: root,
        context,
        request: { name: 'summarize-changes', arguments: '123 extra' },
      })

      expect(result.status).toBe('rendered')
      expect(result.renderedContent).toContain('Issue: 123')
      expect(result.renderedContent).toContain('All: 123 extra')
      expect(result.renderedContent).toContain('First: 123')
      expect(result.renderedContent).toContain('dynamic output')
      expect(result.dynamicCommandCount).toBe(1)
      expect(result.blockedDynamicCommandCount).toBe(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('disables dynamic context without dropping the skill body', async () => {
    const root = tempWorkspace()
    try {
      writeSkill(
        root,
        'safe-summary',
        `---
description: Safe summary
---
Before
!\`git status\`
After
`,
      )

      const result = await runSkill({
        cwd: root,
        context: { cwd: root, policy: createRuntimePolicyForMode('READ_ONLY') },
        request: { name: 'safe-summary', dynamicContext: false },
      })

      expect(result.renderedContent).toContain('[skill shell command execution disabled by policy]')
      expect(result.renderedContent).toContain('After')
      expect(result.blockedDynamicCommandCount).toBe(1)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('routes forked skills through the supplied subagent runner', async () => {
    const root = tempWorkspace()
    try {
      writeSkill(
        root,
        'deep-review',
        `---
description: Deep review
context: fork
agent: reviewer
---
Review $ARGUMENTS
`,
      )

      const result = await runSkill({
        cwd: root,
        context: { cwd: root, policy: createRuntimePolicyForMode('READ_ONLY') },
        request: { name: 'deep-review', arguments: 'PR 1' },
        forkRunner: async (request) => `forked:${request.agent}:${request.goal}`,
      })

      expect(result.status).toBe('dispatched')
      expect(result.dispatchOutput).toContain('forked:reviewer')
      expect(result.dispatchOutput).toContain('Review PR 1')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('renders skill list and show commands', () => {
    const root = tempWorkspace()
    try {
      writeSkill(root, 'local-skill', `---
description: Local skill
---
Body
`)
      expect(renderSkillListCommand(root)).toContain('local-skill')
      expect(renderSkillShowCommand(['local-skill'], root)).toContain('Description: Local skill')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
