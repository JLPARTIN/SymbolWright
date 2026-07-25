#!/usr/bin/env node
import { pathToFileURL } from 'node:url'

import { renderSandboxCommand } from './cli-sandbox.js'

export async function renderSymbolWrightBinCommand(
  args: readonly string[],
  options?: Parameters<typeof renderSandboxCommand>[1],
): Promise<string | undefined> {
  const [command, ...commandArgs] = args
  if (command !== 'sandbox') return undefined

  return renderSandboxCommand(commandArgs, options)
}

export async function runSymbolWrightBin(argv: readonly string[] = process.argv): Promise<void> {
  const output = await renderSymbolWrightBinCommand(argv.slice(2))
  if (output !== undefined) {
    console.log(output)
    return
  }

  await import('./cli.js')
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSymbolWrightBin().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
}
