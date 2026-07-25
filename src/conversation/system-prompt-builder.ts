export interface SystemPromptContext {
  readonly projectName?: string
  readonly projectDescription?: string
  readonly languages?: readonly string[]
  readonly frameworks?: readonly string[]
  readonly testFramework?: string
  readonly availableTools?: readonly string[]
  readonly governanceBoundaries?: readonly string[]
  readonly additionalContext?: readonly string[]
}

export function buildSystemPrompt(context: SystemPromptContext = {}): string {
  const sections: string[] = []

  sections.push(
    'You are SymbolWright, an AI coding agent that helps with repository intelligence, code generation, bug fixing, planning, PR review, and merge-readiness.',
  )
  sections.push(
    'Follow the active runtime mode. In APPROVED_EXECUTION, perform direct implementation work with available tools. In PLAN_ONLY, READ_ONLY, or PROPOSAL_ONLY, stay within the non-mutating boundary. Governance and Ajna forensics are available capabilities, not a permanent approval gate.',
  )

  if (context.projectName !== undefined) {
    const desc = context.projectDescription ? ` — ${context.projectDescription}` : ''
    sections.push(`\nProject: ${context.projectName}${desc}`)
  }

  if (context.languages !== undefined && context.languages.length > 0) {
    sections.push(`Languages: ${context.languages.join(', ')}`)
  }

  if (context.frameworks !== undefined && context.frameworks.length > 0) {
    sections.push(`Frameworks: ${context.frameworks.join(', ')}`)
  }

  if (context.testFramework !== undefined) {
    sections.push(`Test framework: ${context.testFramework}`)
  }

  if (context.availableTools !== undefined && context.availableTools.length > 0) {
    sections.push(`\nAvailable tools: ${context.availableTools.join(', ')}`)
  }

  if (context.governanceBoundaries !== undefined && context.governanceBoundaries.length > 0) {
    sections.push('\nGovernance/forensic boundaries:')
    for (const boundary of context.governanceBoundaries) {
      sections.push(`- ${boundary}`)
    }
  }

  if (context.additionalContext !== undefined && context.additionalContext.length > 0) {
    sections.push('')
    for (const item of context.additionalContext) {
      sections.push(item)
    }
  }

  return sections.join('\n')
}
