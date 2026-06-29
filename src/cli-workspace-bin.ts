#!/usr/bin/env node
import { runWorkspaceCommand } from './cli-workspace.js'

const [, , ...args] = process.argv

runWorkspaceCommand(args).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
