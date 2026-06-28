import type { AgentLoopEvent } from '../agent/agent-loop.types.js'
import type { ProviderTokenUsage } from '../provider/provider.types.js'
import { computeCost } from '../telemetry/cost-tracker.js'

const MAX_TOOL_OUTPUT_CHARS = 500

export interface TerminalRendererOptions {
  readonly model?: string
  readonly showToolOutput?: boolean
  readonly quiet?: boolean
}

function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`
}

function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`
}

function green(text: string): string {
  return `\x1b[32m${text}\x1b[0m`
}

function cyan(text: string): string {
  return `\x1b[36m${text}\x1b[0m`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + `... (${text.length - max} chars truncated)`
}

function formatUsageLine(usage: ProviderTokenUsage, model: string): string {
  const cost = computeCost(usage, model)
  return dim(
    `Tokens: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out | Cost: $${cost.toFixed(4)}`,
  )
}

export function createTerminalRenderer(
  options: TerminalRendererOptions = {},
): (event: AgentLoopEvent) => void {
  const model = options.model ?? 'claude-sonnet-4-20250514'
  const showToolOutput = options.showToolOutput ?? true
  const quiet = options.quiet ?? false
  let totalUsage: ProviderTokenUsage = { inputTokens: 0, outputTokens: 0 }

  return (event: AgentLoopEvent): void => {
    switch (event.type) {
      case 'text_delta':
        process.stdout.write(event.text)
        break

      case 'tool_call_start':
        if (!quiet) {
          process.stderr.write(dim(`\n[Tool: ${event.name}]\n`))
        }
        break

      case 'tool_call_end':
        if (!quiet && showToolOutput) {
          if (event.isError) {
            process.stderr.write(red(`  Error: ${truncate(event.output, MAX_TOOL_OUTPUT_CHARS)}\n`))
          } else {
            process.stderr.write(dim(`  ${truncate(event.output, MAX_TOOL_OUTPUT_CHARS)}\n`))
          }
        }
        break

      case 'iteration_start':
        if (!quiet) {
          process.stderr.write(dim(`\n--- Iteration ${event.iterationNumber} ---\n`))
        }
        break

      case 'iteration_end':
        if (event.usage !== undefined) {
          totalUsage = {
            inputTokens: totalUsage.inputTokens + event.usage.inputTokens,
            outputTokens: totalUsage.outputTokens + event.usage.outputTokens,
          }
        }
        break

      case 'loop_end':
        process.stdout.write('\n')
        if (!quiet) {
          const statusText =
            event.status === 'completed'
              ? green('completed')
              : event.status === 'tool_use_limit'
                ? red('iteration limit reached')
                : red(event.status)

          process.stderr.write(
            `\n${dim('---')}\n` +
              `${cyan('CodeMind')} | ${statusText} in ${event.totalIterations} iteration${event.totalIterations === 1 ? '' : 's'}\n` +
              `${formatUsageLine(totalUsage, model)}\n`,
          )
        }
        break

      case 'error':
        process.stderr.write(red(`\nError: ${event.error}\n`))
        break
    }
  }
}
