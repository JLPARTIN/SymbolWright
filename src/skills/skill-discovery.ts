import fs from 'node:fs'
import path from 'node:path'

import { BUNDLED_SKILLS } from './bundled-skills.js'
import { parseSkillMarkdown } from './skill-frontmatter.js'
import type { SkillDefinition, SkillSource } from './skill-types.js'

function normalizeCommandName(name: string): string {
  const normalized = name.trim()
  if (normalized.length === 0) {
    throw new Error('Skill name cannot be empty.')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
    throw new Error(`Invalid skill name: ${name}`)
  }
  return normalized
}

function toDefinition(input: {
  readonly commandName: string
  readonly markdown: string
  readonly source: SkillSource
  readonly skillDir: string
  readonly entryPath: string
}): SkillDefinition {
  const parsed = parseSkillMarkdown(input.markdown)
  const commandName = normalizeCommandName(input.commandName)
  const displayName = parsed.frontmatter.name ?? commandName
  const description = parsed.frontmatter.description ?? 'No description provided.'

  return {
    commandName,
    displayName,
    description,
    ...(parsed.frontmatter.whenToUse !== undefined
      ? { whenToUse: parsed.frontmatter.whenToUse }
      : {}),
    ...(parsed.frontmatter.argumentHint !== undefined
      ? { argumentHint: parsed.frontmatter.argumentHint }
      : {}),
    arguments: parsed.frontmatter.arguments ?? [],
    disableModelInvocation: parsed.frontmatter.disableModelInvocation ?? false,
    userInvocable: parsed.frontmatter.userInvocable ?? true,
    allowedTools: parsed.frontmatter.allowedTools ?? [],
    disallowedTools: parsed.frontmatter.disallowedTools ?? [],
    context: parsed.frontmatter.context ?? 'inline',
    ...(parsed.frontmatter.agent !== undefined ? { agent: parsed.frontmatter.agent } : {}),
    paths: parsed.frontmatter.paths ?? [],
    shell: parsed.frontmatter.shell ?? 'bash',
    source: input.source,
    skillDir: input.skillDir,
    entryPath: input.entryPath,
    body: parsed.body,
    rawFrontmatter: parsed.rawFrontmatter,
  }
}

function loadBundledSkills(): readonly SkillDefinition[] {
  return BUNDLED_SKILLS.map((skill) =>
    toDefinition({
      commandName: skill.commandName,
      markdown: skill.markdown,
      source: 'bundled',
      skillDir: `<bundled>/${skill.commandName}`,
      entryPath: `<bundled>/${skill.commandName}/SKILL.md`,
    }),
  )
}

function readSkillFile(entryPath: string): string | undefined {
  if (!fs.existsSync(entryPath)) {
    return undefined
  }
  const stat = fs.statSync(entryPath)
  if (!stat.isFile()) {
    return undefined
  }
  return fs.readFileSync(entryPath, 'utf8')
}

function loadSkillDirectory(root: string, source: SkillSource): readonly SkillDefinition[] {
  if (!fs.existsSync(root)) {
    return []
  }

  const entries = fs.readdirSync(root, { withFileTypes: true })
  const skills: SkillDefinition[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillDir = path.join(root, entry.name)
    const entryPath = path.join(skillDir, 'SKILL.md')
    const markdown = readSkillFile(entryPath)
    if (markdown === undefined) continue

    skills.push(
      toDefinition({
        commandName: entry.name,
        markdown,
        source,
        skillDir,
        entryPath,
      }),
    )
  }

  return skills.sort((a, b) => a.commandName.localeCompare(b.commandName))
}

function loadClaudeCommands(root: string): readonly SkillDefinition[] {
  if (!fs.existsSync(root)) {
    return []
  }

  const entries = fs.readdirSync(root, { withFileTypes: true })
  const skills: SkillDefinition[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const entryPath = path.join(root, entry.name)
    const markdown = fs.readFileSync(entryPath, 'utf8')
    const commandName = entry.name.slice(0, -'.md'.length)
    skills.push(
      toDefinition({
        commandName,
        markdown,
        source: 'claude-command',
        skillDir: root,
        entryPath,
      }),
    )
  }

  return skills.sort((a, b) => a.commandName.localeCompare(b.commandName))
}

function addOrReplaceSkill(map: Map<string, SkillDefinition>, skill: SkillDefinition): void {
  map.set(skill.commandName, skill)
}

export function discoverSkills(cwd: string = process.cwd()): readonly SkillDefinition[] {
  const byName = new Map<string, SkillDefinition>()

  for (const skill of loadBundledSkills()) addOrReplaceSkill(byName, skill)
  for (const skill of loadClaudeCommands(path.join(cwd, '.claude', 'commands'))) {
    addOrReplaceSkill(byName, skill)
  }
  for (const skill of loadSkillDirectory(path.join(cwd, '.claude', 'skills'), 'claude-project')) {
    addOrReplaceSkill(byName, skill)
  }
  for (const skill of loadSkillDirectory(path.join(cwd, '.symbolwright', 'skills'), 'project')) {
    addOrReplaceSkill(byName, skill)
  }

  return [...byName.values()].sort((a, b) => a.commandName.localeCompare(b.commandName))
}

export function getSkillByName(
  name: string,
  cwd: string = process.cwd(),
): SkillDefinition | undefined {
  return discoverSkills(cwd).find((skill) => skill.commandName === name)
}

export function requireSkillByName(name: string, cwd: string = process.cwd()): SkillDefinition {
  const skill = getSkillByName(name, cwd)
  if (skill === undefined) {
    throw new Error(
      `Skill not found: ${name}. Run "symbolwright skill list" to see available skills.`,
    )
  }
  return skill
}
