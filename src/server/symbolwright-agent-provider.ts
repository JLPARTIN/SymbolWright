import { createAnthropicProvider } from '../provider/anthropic-provider.js'
import { createGeminiLlmProvider } from '../provider/gemini-llm-provider.js'
import { createOpenAiCompatibleLlmProvider } from '../provider/openai-compatible-llm-provider.js'
import type { LLMProvider } from '../provider/provider.types.js'
import type { ProviderResolvedConfig } from '../providers/provider-gateway.types.js'

export class AgentProviderMissingCredentialsError extends Error {}

/**
 * Builds the tool-calling `LLMProvider` for the `/api/agent` loop. Unlike
 * the plain-chat `/api/chat` endpoint (which treats every provider as a
 * single-turn text completion), running the real agent/tool-execution loop
 * requires a provider implementation that actually speaks that vendor's
 * function-calling wire format — so this covers every provider that has
 * one: Anthropic (native `tool_use`), the whole OpenAI-compatible family
 * (OpenAI, Groq, OpenRouter, GitHub Models, Ollama, DeepSeek, custom
 * OpenAI-compatible endpoints), which all share one `tools`/`tool_calls`
 * format, and Google Gemini (`functionDeclarations`/`functionCall`).
 */
export function resolveAgentLlmProvider(config: ProviderResolvedConfig): LLMProvider {
  if (config.id === 'google-gemini') {
    if (config.apiKey === undefined) {
      throw new AgentProviderMissingCredentialsError(`${config.displayName} API key is missing`)
    }
    return createGeminiLlmProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      ...(config.defaultModel === undefined ? {} : { model: config.defaultModel }),
    })
  }

  if (config.id === 'anthropic') {
    if (config.apiKey === undefined) {
      throw new AgentProviderMissingCredentialsError(`${config.displayName} API key is missing`)
    }
    return createAnthropicProvider({
      apiKey: config.apiKey,
      ...(config.defaultModel === undefined ? {} : { model: config.defaultModel }),
      baseURL: config.baseUrl,
    })
  }

  if (config.id !== 'ollama' && config.id !== 'custom' && config.apiKey === undefined) {
    throw new AgentProviderMissingCredentialsError(`${config.displayName} API key is missing`)
  }

  return createOpenAiCompatibleLlmProvider({
    providerId: config.id,
    displayName: config.displayName,
    baseUrl: config.baseUrl,
    ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    ...(config.defaultModel === undefined ? {} : { model: config.defaultModel }),
  })
}
