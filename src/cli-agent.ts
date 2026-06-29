import { mkdirSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'

import {
  resolveCodemindConfig,
  validateCodemindConfig,
  type CodemindConfig,
} from './config/codemind-config.js'
import { conversationMessagesToProviderMessages } from './conversation/transcript-bridge.js'
import { trimConversationToFit } from './conversation/context-window.js'
import type { ConversationMessage } from './conversation/conversation.types.js'
import { createAnthropicProvider } from './provider/anthropic-provider.js'
import type { LLMProvider } from './provider/provider.types.js'
import type { CodemindProviderId } from './providers/provider-adapter-contract.js'
import { loadProviderGatewayConfig, parseProviderId } from './providers/provider-config.js'
import { createProviderGatewayLlmProvider } from './providers/provider-gateway-llm-provider.js'
import {
  createRuntimePolicyForMode,
  DEFAULT_CODEMIND_RUNTIME_MODE,
  normalizeCodemindRuntimeMode,
} from './runtime/policy/runtime-policy.js'
import { assembleAgentTools } from './runtime/tools/tool-assembly.js'
import type {
  CodemindRuntimeMode,
  RuntimeApproval,
  RuntimePolicySnapshot,
  RuntimeToolContext,
} from './runtime/types.js'
import {
  runActivatedAgent,
  type CodemindActivationConfig,
} from './activation/codemind-activation.js'
import { createTerminalRenderer } from './tui/terminal-renderer.js'
import {
  classifyError,
  formatErrorForUser,
  withRetry,
} from './runtime/error-handling/error-handler.js'
import { CostTracker, renderUsageSummary } from './telemetry/cost-tracker.js'
import { SessionPersistence } from './storage/session-persistence.js'
import { resolveStoragePaths } from './storage/storage-paths.js'
import { WorkspaceManager } from './workspace/workspace-manager.js'
import { ProjectMemory, resolveProjectMemoryDir } from './memory/project-memory.js'
import {
  createHashEmbeddingProvider,
  createVoyageEmbeddingProvider,
} from './memory/embedding-provider.js'
import type { EmbeddingProvider } from './memory/embedding-provider.js'
import { loadVectorStore } from './cli-index.js'

interface ParsedAgentArgs {
  readonly resumeSessionId?: string
  readonly runtimeMode?: CodemindRuntimeMode
  readonly provider?: CodemindProviderId
  readonly model?: string
  readonly attachApprovalTicket: boolean
  readonly userArgs: readonly string[]
}

function buildPolicy(
  mode: CodemindRuntimeMode,
  hasGitHubToken: boolean = false,
): RuntimePolicySnapshot {
  return createRuntimePolicyForMode(mode, { hasGitHubToken })
}

function parseModeFlag(value: string): CodemindRuntimeMode {
  const mode = normalizeCodemindRuntimeMode(value)
  if (mode === undefined) {
    throw new Error(
      `Invalid runtime mode: ${value}. Expected PLAN_ONLY, READ_ONLY, PROPOSAL_ONLY, or APPROVED_EXECUTION.`,
    )
  }
  return mode
}

function parseProviderFlag(value: string): CodemindProviderId {
  const provider = parseProviderId(value)
  if (provider === undefined) {
    throw new Error(`Invalid provider: ${value}. Run "codemind providers" for supported providers.`)
  }
  return provider
}

function parseAgentArgs(args: readonly string[]): ParsedAgentArgs {
  let resumeSessionId: string | undefined
  let runtimeMode: CodemindRuntimeMode | undefined
  let provider: CodemindProviderId | undefined
  let model: string | undefined
  let attachApprovalTicket = false
  const userArgs: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue

    if (arg === '--resume' && i + 1 < args.length) {
      resumeSessionId = args[i + 1]
      i++
      continue
    }

    if (arg === '--mode') {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Missing value for --mode')
      }
      runtimeMode = parseModeFlag(value)
      i++
      continue
    }

    if (arg.startsWith('--mode=')) {
      runtimeMode = parseModeFlag(arg.slice('--mode='.length))
      continue
    }

    if (arg === '--provider') {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Missing value for --provider')
      }
      provider = parseProviderFlag(value)
      i++
      continue
    }

    if (arg.startsWith('--provider=')) {
      provider = parseProviderFlag(arg.slice('--provider='.length))
      continue
    }

    if (arg === '--model') {
      const value = args[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('Missing value for --model')
      }
      model = value
      i++
      continue
    }

    if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length)
      continue
    }

    if (arg === '--read-only') {
      runtimeMode = 'READ_ONLY'
      continue
    }

    if (arg === '--proposal-only') {
      runtimeMode = 'PROPOSAL_ONLY'
      continue
    }

    if (arg === '--plan-only') {
      runtimeMode = 'PLAN_ONLY'
      continue
    }

    if (arg === '--approved') {
      runtimeMode = 'APPROVED_EXECUTION'
      attachApprovalTicket = true
      continue
    }

    userArgs.push(arg)
  }

  return {
    ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
    ...(runtimeMode !== undefined ? { runtimeMode } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(model !== undefined ? { model } : {}),
    attachApprovalTicket,
    userArgs,
  }
}

function createProvider(config: CodemindConfig): LLMProvider {
  if (config.provider !== undefined && config.provider !== 'anthropic') {
    const gatewayConfig = loadProviderGatewayConfig({
      ...process.env,
      CODEMIND_PROVIDER: config.provider,
      ...(config.model === undefined ? {} : { CODEMIND_MODEL: config.model }),
    })
    return createProviderGatewayLlmProvider({ config: gatewayConfig })
  }

  return createAnthropicProvider({
    apiKey: config.anthropicApiKey!,
    ...(config.model !== undefined ? { model: config.model } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
    ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
  })
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

function resolveEmbeddingProvider(config: CodemindConfig): EmbeddingProvider {
  if (config.embeddingProvider === 'voyage' && config.voyageApiKey !== undefined) {
    return createVoyageEmbeddingProvider({ apiKey: config.voyageApiKey })
  }
  return createHashEmbeddingProvider()
}

function resolveDisplayModel(config: CodemindConfig): string {
  if (config.model !== undefined) {
    return config.model
  }
  if (config.provider !== undefined && config.provider !== 'anthropic') {
    return `${config.provider}:default`
  }
  return 'claude-sonnet-4-20250514'
}

function createMessage(role: ConversationMessage['role'], content: string): ConversationMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

async function runOneShot(
  provider: LLMProvider,
  toolContext: RuntimeToolContext,
  userMessage: string,
  config: CodemindConfig,
  costTracker: CostTracker,
  persistence: SessionPersistence,
  memoryContext: string,
): Promise<void> {
  const tools = assembleAgentTools()
  const model = resolveDisplayModel(config)
  const renderer = createTerminalRenderer({ model })
  const sessionId = `cm-${Date.now()}`

  const activationConfig: CodemindActivationConfig = {
    provider,
    tools,
    toolContext,
    sessionId,
    ...(config.githubToken !== undefined ? { githubToken: config.githubToken } : {}),
    onEvent: renderer,
    ...(memoryContext.length > 0 ? { promptContext: { conversationSummary: memoryContext } } : {}),
  }

  persistence.appendMessage(sessionId, createMessage('user', userMessage))

  const result = await withRetry(async () => runActivatedAgent(activationConfig, userMessage))

  persistence.appendMessage(sessionId, createMessage('assistant', result.agentResult.finalText))

  costTracker.record(sessionId, model, result.agentResult.totalUsage, 'orchestrator')

  if (result.agentResult.status === 'error') {
    process.exitCode = 1
  }
}

async function runInteractive(
  provider: LLMProvider,
  toolContext: RuntimeToolContext,
  config: CodemindConfig,
  costTracker: CostTracker,
  persistence: SessionPersistence,
  memoryContext: string,
  resumeSessionId?: string,
): Promise<void> {
  const tools = assembleAgentTools()
  const model = resolveDisplayModel(config)
  const sessionId = resumeSessionId ?? `cm-${Date.now()}`

  const conversationHistory: ConversationMessage[] = []

  if (resumeSessionId !== undefined) {
    const restored = persistence.load(resumeSessionId)
    if (restored.length > 0) {
      conversationHistory.push(...restored)
      console.log(`\x1b[2mResuming session ${resumeSessionId} (${restored.length} messages)\x1b[0m`)
    }
  }

  const rl = createInterface({ input: stdin, output: stdout })

  console.log('\x1b[36mCodeMind\x1b[0m interactive mode')
  console.log(`\x1b[2mSession: ${sessionId}\x1b[0m`)
  console.log(`\x1b[2mRuntime mode: ${toolContext.policy.mode}\x1b[0m`)
  console.log(`\x1b[2mProvider: ${provider.displayName}\x1b[0m`)
  console.log('\x1b[2mCommands: /exit, /cost, /session, /clear, /help\x1b[0m\n')

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

      if (trimmed === '/session') {
        console.log(`\n\x1b[2mSession ID: ${sessionId}\x1b[0m\n`)
        continue
      }

      if (trimmed === '/clear') {
        conversationHistory.length = 0
        console.log('\x1b[2mConversation cleared.\x1b[0m\n')
        continue
      }

      if (trimmed === '/help') {
        console.log('\n\x1b[2mCommands: /exit, /cost, /session, /clear, /help\x1b[0m\n')
        continue
      }

      const renderer = createTerminalRenderer({ model })

      const trimmedHistory = trimConversationToFit(conversationHistory)
      const priorMessages = conversationMessagesToProviderMessages(trimmedHistory)

      const activationConfig: CodemindActivationConfig = {
        provider,
        tools,
        toolContext,
        sessionId,
        ...(config.githubToken !== undefined ? { githubToken: config.githubToken } : {}),
        ...(priorMessages.length > 0 ? { priorMessages } : {}),
        onEvent: renderer,
        ...(memoryContext.length > 0
          ? { promptContext: { conversationSummary: memoryContext } }
          : {}),
      }

      const userMsg = createMessage('user', trimmed)
      conversationHistory.push(userMsg)
      persistence.appendMessage(sessionId, userMsg)

      try {
        const result = await withRetry(async () => runActivatedAgent(activationConfig, trimmed))

        const assistantMsg = createMessage('assistant', result.agentResult.finalText)
        conversationHistory.push(assistantMsg)
        persistence.appendMessage(sessionId, assistantMsg)

        costTracker.record(sessionId, model, result.agentResult.totalUsage, 'orchestrator')
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

export function renderSessionsList(persistence: SessionPersistence): string {
  const sessions = persistence.listSessions()
  if (sessions.length === 0) {
    return 'No saved sessions.'
  }
  const lines = ['CodeMind Sessions', '']
  for (const s of sessions) {
    const goalPreview = s.goal !== undefined ? ` — ${s.goal}` : ''
    lines.push(`  ${s.sessionId}  (${s.messageCount} messages, ${s.updatedAt})${goalPreview}`)
  }
  return lines.join('\n')
}

export async function runAgentCommand(args: readonly string[]): Promise<void> {
  const parsedArgs = parseAgentArgs(args)
  const cliFlags: Partial<CodemindConfig> = {
    ...(parsedArgs.runtimeMode !== undefined ? { runtimeMode: parsedArgs.runtimeMode } : {}),
    ...(parsedArgs.provider !== undefined ? { provider: parsedArgs.provider } : {}),
    ...(parsedArgs.model !== undefined ? { model: parsedArgs.model } : {}),
  }
  const config = resolveCodemindConfig({ cliFlags })
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
  const cwd = process.cwd()
  const embeddingProvider = resolveEmbeddingProvider(config)
  const costTracker = new CostTracker()

  const storagePaths = resolveStoragePaths(cwd)
  ensureDir(storagePaths.sessionsDir)
  const persistence = new SessionPersistence(storagePaths.sessionsDir)

  const workspace = new WorkspaceManager()
  workspace.add(cwd)

  let memoryContext = ''
  try {
    const memoryDir = resolveProjectMemoryDir(cwd)
    const memory = new ProjectMemory(memoryDir)
    memoryContext = memory.buildContextSection()
  } catch {
    // memory dir may not exist yet — that's fine
  }

  const vectorStore = loadVectorStore(cwd)

  const runtimeMode = config.runtimeMode ?? DEFAULT_CODEMIND_RUNTIME_MODE
  const hasGitHubToken = config.githubToken !== undefined
  const policy = buildPolicy(runtimeMode, hasGitHubToken)
  const scopes: RuntimeApproval['scopes'][number][] = [
    'file:write',
    'apply_edit',
    'command:validate',
    'shell:execute',
    'git:write',
  ]
  if (policy.allowGitHubWrites) {
    scopes.push('github:write')
  }
  const approval: RuntimeApproval | undefined = parsedArgs.attachApprovalTicket
    ? {
        ticketId: `cli-${Date.now()}`,
        approvedBy: 'operator',
        scopes,
      }
    : undefined
  const toolContext: RuntimeToolContext = {
    cwd,
    policy,
    embeddingProvider,
    workspace,
    ...(approval !== undefined ? { approval } : {}),
  }

  const userMessage = parsedArgs.userArgs.join(' ').trim()

  try {
    if (userMessage.length > 0) {
      let ragContext = ''
      if (vectorStore !== undefined) {
        try {
          const { buildRagContext } = await import('./memory/rag-context-builder.js')
          const ragResult = await buildRagContext(userMessage, vectorStore, embeddingProvider)
          if (ragResult.chunksUsed > 0) {
            ragContext = ragResult.contextText
          }
        } catch {
          // RAG query failed — proceed without it
        }
      }
      const fullContext = [memoryContext, ragContext].filter((s) => s.length > 0).join('\n\n')
      await runOneShot(
        provider,
        toolContext,
        userMessage,
        config,
        costTracker,
        persistence,
        fullContext,
      )
    } else {
      await runInteractive(
        provider,
        toolContext,
        config,
        costTracker,
        persistence,
        memoryContext,
        parsedArgs.resumeSessionId,
      )
    }
  } catch (error: unknown) {
    const classified = classifyError(error)
    console.error(formatErrorForUser(classified))
    process.exit(1)
  }
}
