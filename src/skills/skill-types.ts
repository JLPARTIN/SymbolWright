import type { CodemindToolName } from '../runtime/types.js'
import type { SubagentName } from '../hivemind/subagent-definitions.js'

export const SKILL_CONTEXTS = ['inline', 'fork'] as const
export type SkillContext = (typeof SKILL_CONTEXTS)[number]

export const SKILL_SHELLS = ['bash', 'powershell'] as const
export type SkillShell = (typeof SKILL_SHELLS)[number]

export const SKILL_SOURCES = ['bundled', 'project', 'claude-project', 'claude-command'] as const
export type SkillSource = (typeof SKILL_SOURCES)[number]

export interface SkillFrontmatter {
  readonly name?: string
  readonly description?: string
  readonly whenToUse?: string
  readonly argumentHint?: string
  readonly arguments?: readonly string[]
  readonly disableModelInvocation?: boolean
  readonly userInvocable?: boolean
  readonly allowedTools?: readonly CodemindToolName[]
  readonly disallowedTools?: readonly CodemindToolName[]
  readonly context?: SkillContext
  readonly agent?: SubagentName
  readonly paths?: readonly string[]
  readonly shell?: SkillShell
}

export interface SkillDefinition {
  readonly commandName: string
  readonly displayName: string
  readonly description: string
  readonly whenToUse?: string
  readonly argumentHint?: string
  readonly arguments: readonly string[]
  readonly disableModelInvocation: boolean
  readonly userInvocable: boolean
  readonly allowedTools: readonly CodemindToolName[]
  readonly disallowedTools: readonly CodemindToolName[]
  readonly context: SkillContext
  readonly agent?: SubagentName
  readonly paths: readonly string[]
  readonly shell: SkillShell
  readonly source: SkillSource
  readonly skillDir: string
  readonly entryPath: string
  readonly body: string
  readonly rawFrontmatter: Readonly<Record<string, unknown>>
}

export interface SkillRenderInput {
  readonly skill: SkillDefinition
  readonly rawArguments?: string
  readonly sessionId: string
  readonly projectDir: string
  readonly dynamicContext: boolean
  readonly disableShellExecution: boolean
}

export interface RenderedSkill {
  readonly skill: SkillDefinition
  readonly content: string
  readonly dynamicCommandCount: number
  readonly blockedDynamicCommandCount: number
}

export interface SkillRunInput {
  readonly name: string
  readonly arguments?: string
  readonly mode?: 'inline' | 'fork'
  readonly enableGovernedTools?: boolean
  readonly dynamicContext?: boolean
}

export interface SkillRunResult {
  readonly skill: SkillDefinition
  readonly status: 'rendered' | 'dispatched'
  readonly renderedContent: string
  readonly dynamicCommandCount: number
  readonly blockedDynamicCommandCount: number
  readonly dispatchOutput?: string
}
