import type { LLMProvider as SymbolWrightLLMProvider } from '../provider/provider.types.js'
import type { LLMProvider as MemoryLLMProvider } from './consolidation-engine.js'

/** Adapts SymbolWright's streaming provider interface to memory's simple generate() contract. */
export function createMemoryLlmAdapter(provider: SymbolWrightLLMProvider): MemoryLLMProvider {
  return {
    async generate(prompt: string): Promise<string> {
      let text = ''
      for await (const event of provider.complete([{ role: 'user', content: prompt }])) {
        if (event.type === 'text_delta') {
          text += event.text
        }
      }
      return text
    },
  }
}
