import type { LLMProvider, ProviderMessage, ProviderStreamEvent, ProviderTokenUsage } from '../provider/provider.types.js'
import type { RuntimeToolDefinition, RuntimeToolContext } from '../runtime/types.js'
import type {
  AgentLoopConfig,
  AgentLoopEvent,
  AgentLoopIteration,
  AgentLoopResult,
  AgentLoopToolCall,
  AgentLoopToolResult,
} from './agent-loop.types.js'
import { bridgeToolsForProvider, extractProviderTools, type BridgedToolDefinition } from './tool-schema-bridge.js'

const DEFAULT_MAX_ITERATIONS = 50

function addUsage(a: ProviderTokenUsage, b: ProviderTokenUsage): ProviderTokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    ...(a.cacheReadInputTokens !== undefined || b.cacheReadInputTokens !== undefined
      ? { cacheReadInputTokens: (a.cacheReadInputTokens ?? 0) + (b.cacheReadInputTokens ?? 0) }
      : {}),
    ...(a.cacheCreationInputTokens !== undefined || b.cacheCreationInputTokens !== undefined
      ? { cacheCreationInputTokens: (a.cacheCreationInputTokens ?? 0) + (b.cacheCreationInputTokens ?? 0) }
      : {}),
  }
}

function emptyUsage(): ProviderTokenUsage {
  return { inputTokens: 0, outputTokens: 0 }
}

async function collectStreamEvents(
  stream: AsyncIterable<ProviderStreamEvent>,
  onEvent?: (event: AgentLoopEvent) => void,
): Promise<{
  textParts: string[]
  toolCalls: AgentLoopToolCall[]
  stopReason: string
  usage: ProviderTokenUsage
}> {
  const textParts: string[] = []
  const toolCalls: AgentLoopToolCall[] = []
  let stopReason = 'end_turn'
  let usage = emptyUsage()


  for await (const event of stream) {
    switch (event.type) {
      case 'text_delta':
        textParts.push(event.text)
        onEvent?.({ type: 'text_delta', text: event.text })
        break

      case 'tool_use_start':
        onEvent?.({ type: 'tool_call_start', id: event.id, name: event.name })
        break

      case 'tool_use_end':
        toolCalls.push({
          id: event.id,
          name: event.name,
          input: event.input,
        })
        break

      case 'message_stop':
        stopReason = event.stopReason
        usage = event.usage
        break

      case 'error':
        onEvent?.({ type: 'error', error: event.error })
        break
    }
  }

  return { textParts, toolCalls, stopReason, usage }
}

async function executeToolCall(
  call: AgentLoopToolCall,
  bridgedTools: readonly BridgedToolDefinition[],
  toolContext: RuntimeToolContext,
): Promise<AgentLoopToolResult> {
  const bridged = bridgedTools.find((bt) => bt.providerTool.name === call.name)

  if (bridged === undefined) {
    return {
      toolUseId: call.id,
      name: call.name,
      output: `Error: Unknown tool '${call.name}'.`,
      isError: true,
      durationMs: 0,
    }
  }

  const startTime = Date.now()
  try {
    const output = await bridged.runtimeTool.execute(call.input, toolContext)
    return {
      toolUseId: call.id,
      name: call.name,
      output,
      isError: false,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      toolUseId: call.id,
      name: call.name,
      output: `Error executing tool '${call.name}': ${message}`,
      isError: true,
      durationMs: Date.now() - startTime,
    }
  }
}

function toolResultsToMessages(results: readonly AgentLoopToolResult[]): ProviderMessage[] {
  return results.map((result) => ({
    role: 'tool_result' as const,
    content: [
      {
        type: 'tool_result' as const,
        toolUseId: result.toolUseId,
        content: result.output,
        ...(result.isError ? { isError: true } : {}),
      },
    ],
  }))
}

function toolCallsToAssistantMessage(
  textParts: readonly string[],
  toolCalls: readonly AgentLoopToolCall[],
): ProviderMessage {
  const content = [
    ...(textParts.length > 0
      ? [{ type: 'text' as const, text: textParts.join('') }]
      : []),
    ...toolCalls.map((call) => ({
      type: 'tool_use' as const,
      id: call.id,
      name: call.name,
      input: call.input,
    })),
  ]

  return { role: 'assistant', content }
}

export async function runAgentLoop(
  provider: LLMProvider,
  userMessage: string,
  tools: readonly RuntimeToolDefinition[],
  toolContext: RuntimeToolContext,
  config: AgentLoopConfig,
  onEvent?: (event: AgentLoopEvent) => void,
): Promise<AgentLoopResult> {
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const bridgedTools = bridgeToolsForProvider(tools, toolContext.policy)
  const providerTools = extractProviderTools(bridgedTools)

  const messages: ProviderMessage[] = [
    { role: 'user', content: userMessage },
  ]

  const iterations: AgentLoopIteration[] = []
  let totalUsage = emptyUsage()
  let finalText = ''

  for (let i = 0; i < maxIterations; i++) {
    onEvent?.({ type: 'iteration_start', iterationNumber: i + 1 })

    let streamResult: Awaited<ReturnType<typeof collectStreamEvents>>
    try {
      const stream = provider.complete(messages, providerTools, {
        systemPrompt: config.systemPrompt,
        ...(config.model !== undefined ? { model: config.model } : {}),
        ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      })
      streamResult = await collectStreamEvents(stream, onEvent)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      onEvent?.({ type: 'error', error: errorMsg })
      return {
        status: 'error',
        finalText: '',
        iterations,
        totalIterations: i + 1,
        totalUsage,
        error: errorMsg,
      }
    }

    totalUsage = addUsage(totalUsage, streamResult.usage)
    onEvent?.({ type: 'iteration_end', iterationNumber: i + 1, usage: streamResult.usage })

    if (streamResult.toolCalls.length === 0) {
      finalText = streamResult.textParts.join('')
      iterations.push({
        iterationNumber: i + 1,
        toolCalls: [],
        toolResults: [],
        textResponse: finalText,
        usage: streamResult.usage,
      })

      onEvent?.({ type: 'loop_end', status: 'completed', totalIterations: i + 1 })
      return {
        status: 'completed',
        finalText,
        iterations,
        totalIterations: i + 1,
        totalUsage,
      }
    }

    messages.push(toolCallsToAssistantMessage(streamResult.textParts, streamResult.toolCalls))

    const toolResults: AgentLoopToolResult[] = []
    for (const call of streamResult.toolCalls) {
      const result = await executeToolCall(call, bridgedTools, toolContext)
      toolResults.push(result)
      onEvent?.({
        type: 'tool_call_end',
        id: call.id,
        name: call.name,
        output: result.output,
        isError: result.isError,
        durationMs: result.durationMs,
      })
    }

    messages.push(...toolResultsToMessages(toolResults))

    const iterText = streamResult.textParts.join('')
    iterations.push({
      iterationNumber: i + 1,
      toolCalls: streamResult.toolCalls,
      toolResults,
      ...(iterText.length > 0 ? { textResponse: iterText } : {}),
      usage: streamResult.usage,
    })
  }

  finalText = 'Agent loop reached maximum iterations without completing.'
  onEvent?.({ type: 'loop_end', status: 'tool_use_limit', totalIterations: maxIterations })

  return {
    status: 'tool_use_limit',
    finalText,
    iterations,
    totalIterations: maxIterations,
    totalUsage,
  }
}
