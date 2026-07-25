import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { discoverSkills, requireSkillByName } from './skill-discovery.js'

function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'symbolwright-skills-'))
}

describe('discoverSkills', () => {
  it('loads bundled skills out of the gate', () => {
    const root = tempWorkspace()
    try {
      const names = discoverSkills(root).map((skill) => skill.commandName)
      expect(names).toContain('repo-forensics')
      expect(names).toContain('run')
      expect(names).toContain('verify')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('loads native project skills and lets them override bundled names', () => {
    const root = tempWorkspace()
    try {
      const skillDir = path.join(root, '.symbolwright', 'skills', 'repo-forensics')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---
description: Project override
---
Project body
`,
      )

      const skill = requireSkillByName('repo-forensics', root)
      expect(skill.source).toBe('project')
      expect(skill.description).toBe('Project override')
      expect(skill.body).toBe('Project body')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('loads Claude-compatible project skills and command files', () => {
    const root = tempWorkspace()
    try {
      const skillDir = path.join(root, '.claude', 'skills', 'summarize-changes')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---
description: Summarize changes
---
Summarize $ARGUMENTS
`,
      )

      const commandDir = path.join(root, '.claude', 'commands')
      fs.mkdirSync(commandDir, { recursive: true })
      fs.writeFileSync(
        path.join(commandDir, 'deploy.md'),
        `---
description: Deploy command
---
Deploy $ARGUMENTS
`,
      )

      const names = discoverSkills(root).map((skill) => `${skill.commandName}:${skill.source}`)
      expect(names).toContain('summarize-changes:claude-project')
      expect(names).toContain('deploy:claude-command')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
