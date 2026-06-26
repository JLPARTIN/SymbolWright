import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { resolveCodemindConfig, validateCodemindConfig, type CodemindConfig } from './config/codemind-config.js'
import { createAnthropicProvider } from './provider/anthropic-provider.js'
import type { LLMProvider } from './provider/provider.types.js'
import { assembleAgentTools } from './runtime/tools/tool-assembly.js'
import type { RuntimeToolContext, RuntimePolicySnapshot } from './runtime/types.js'
import { runActivatedAgent, type CodemindActivationConfig } from './activation/codemind-activation.js'
import { createTerminalRenderer } from './tui/terminal-renderer.js'
import { classifyError, formatErrorForUser, withRetry } from './runtime/error-handling/error-handler.js'
import { CostTracker, renderUsageSummary } from './telemetry/cost-tracker.js'

function buildPolicy(): RuntimePolicySnapshot {
  return {
    mode: 'APPROVED_EXECUTION',
    allowNetwork: false,
    allowShell: true,
    allowWrites: true,
    allowGitHubWrites: false,
    protectedPaths: [],
    noisyDirs: ['node_modules', '.git', 'dist'],
  }
}

function createProvider(config: CodemindConfig): LLMProvider {
  return createAnthropicProvider({
    apiKey: config.anthropicApiKey!,
    ...(config.model !== undefined ? { model: config.model } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
  })
}

async function runOneShot(
  provider: LLMProvider,
  toolContext: RuntimeToolContext,
  userMessage: string,
  config: CodemindConfig,
  costTracker: CostTracker,
): Promise<void> {
  const tools = assembleAgentTools()
  const model = config.model ?? 'claude-sonnet-4-20250514'
  const renderer = createTerminalRenderer({ model })
  const sessionId = `cm-${Date.now()}`

  const activationConfig: CodemindActivationConfig = {
    provider,
    tools,
    toolContext,
    sessionId,
    onEvent: renderer,
  }

  const result = await withRetry(async () => runActivatedAgent(activationConfig, userMessage))

  costTracker.record(
    sessionId,
    model,
    result.agentResult.totalUsage,
    'orchestrator',
  )

  if (result.agentResult.status === 'error') {
    process.exitCode = 1
  }
}

async function runInteractive(
  provider: LLMProvider,
  toolContext: RuntimeToolContext,
  config: CodemindConfig,
  costTracker: CostTracker,
): Promise<void> {
  const tools = assembleAgentTools()
  const model = config.model ?? 'claude-sonnet-4-20250514'
  const sessionId = `cm-${Date.now()}`

  const rl = createInterface({ input: stdin, output: stdout })

  console.log('\x1b[36mCodeMind\x1b[0m interactive mode')
  console.log('\x1b[2mType your message, or /exit to quit, /cost for usage summary\x1b[0m\n')

  try {
    for (;;) {
      let line: string
      try {
        line = await rl.question('\x1b[36m>\x1b[0m ')
      } catch {
        break
      }

      const trimmed = line.trim()
      if (trimmed.length === 0) continue

      if (trimmed === '/exit' || trimmed === '/quit') break

      if (trimmed === '/cost') {
        const summary = costTracker.summarize(sessionId)
        console.log('\n' + renderUsageSummary(summary) + '\n')
        continue
      }

      if (trimmed === '/help') {
        console.log('\n\x1b[2mCommands: /exit, /cost, /help\x1b[0m\n')
        continue
      }

      const renderer = createTerminalRenderer({ model })

      const activationConfig: CodemindActivationConfig = {
        provider,
        tools,
        toolContext,
        sessionId,
        onEvent: renderer,
      }

      try {
        const result = await withRetry(
          async () => runActivatedAgent(activationConfig, trimmed),
        )

        costTracker.record(
          sessionId,
          model,
          result.agentResult.totalUsage,
          'orchestrator',
        )
      } catch (error: unknown) {
        const classified = classifyError(error)
        console.error('\n\x1b[31m' + formatErrorForUser(classified) + '\x1b[0m\n')
      }
    }
  } finally {
    rl.close()
  }

  const summary = costTracker.summarize(sessionId)
  if (summary.recordCount > 0) {
    console.log('\n' + renderUsageSummary(summary))
  }
}

export async function runAgentCommand(args: readonly string[]): Promise<void> {
  const config = resolveCodemindConfig()
  const validation = validateCodemindConfig(config)

  if (!validation.valid) {
    for (const error of validation.errors) {
      console.error(`Error: ${error}`)
    }
    process.exit(1)
  }

  for (const warning of validation.warnings) {
    console.error(`Warning: ${warning}`)
  }

  const provider = createProvider(config)
  const policy = buildPolicy()
  const toolContext: RuntimeToolContext = {
    cwd: process.cwd(),
    policy,
  }
  const costTracker = new CostTracker()

  const userMessage = args.join(' ').trim()

  try {
    if (userMessage.length > 0) {
      await runOneShot(provider, toolContext, userMessage, config, costTracker)
    } else {
      await runInteractive(provider, toolContext, config, costTracker)
    }
  } catch (error: unknown) {
    const classified = classifyError(error)
    console.error(formatErrorForUser(classified))
    process.exit(1)
  }
}
