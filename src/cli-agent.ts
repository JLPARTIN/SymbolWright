import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { mkdirSync } from 'node:fs'

import {
  resolveCodemindConfig,
  validateCodemindConfig,
  type CodemindConfig,
} from './config/codemind-config.js'
import { createDefaultRuntimePolicy } from './runtime/policy/runtime-policy.js'
import { createAnthropicProvider } from './provider/anthropic-provider.js'
import type { LLMProvider } from './provider/provider.types.js'
import { assembleAgentTools } from './runtime/tools/tool-assembly.js'
import type { RuntimeToolContext, RuntimePolicySnapshot, RuntimeApproval } from './runtime/types.js'
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
import type { ConversationMessage } from './conversation/conversation.types.js'
import { conversationMessagesToProviderMessages } from './conversation/transcript-bridge.js'
import { trimConversationToFit } from './conversation/context-window.js'
import { WorkspaceManager } from './workspace/workspace-manager.js'
import { ProjectMemory, resolveProjectMemoryDir } from './memory/project-memory.js'
import {
  createHashEmbeddingProvider,
  createVoyageEmbeddingProvider,
} from './memory/embedding-provider.js'
import type { EmbeddingProvider } from './memory/embedding-provider.js'
import { loadVectorStore } from './cli-index.js'

function buildPolicy(approved: boolean): RuntimePolicySnapshot {
  if (approved) {
    return {
      ...createDefaultRuntimePolicy(),
      mode: 'APPROVED_EXECUTION',
      allowShell: true,
      allowWrites: true,
    }
  }
  return createDefaultRuntimePolicy()
}

function createProvider(config: CodemindConfig): LLMProvider {
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
  const model = config.model ?? 'claude-sonnet-4-20250514'
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
  const model = config.model ?? 'claude-sonnet-4-20250514'
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

  let resumeSessionId: string | undefined
  let approvedMode = false
  const filteredArgs: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--resume' && i + 1 < args.length) {
      resumeSessionId = args[i + 1]
      i++
    } else if (arg === '--approved') {
      approvedMode = true
    } else {
      filteredArgs.push(arg!)
    }
  }

  const policy = buildPolicy(approvedMode)
  const approval: RuntimeApproval | undefined = approvedMode
    ? {
        ticketId: `cli-${Date.now()}`,
        approvedBy: 'operator',
        scopes: ['file:write', 'apply_edit', 'command:validate', 'shell:execute', 'git:write'],
      }
    : undefined
  const toolContext: RuntimeToolContext = {
    cwd,
    policy,
    embeddingProvider,
    workspace,
    ...(approval !== undefined ? { approval } : {}),
  }

  const userMessage = filteredArgs.join(' ').trim()

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
        resumeSessionId,
      )
    }
  } catch (error: unknown) {
    const classified = classifyError(error)
    console.error(formatErrorForUser(classified))
    process.exit(1)
  }
}
