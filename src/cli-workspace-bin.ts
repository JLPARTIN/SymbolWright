#!/usr/bin/env node
import { renderWorkspaceCommand } from './cli-workspace.js'

const [, , ...args] = process.argv

console.log(renderWorkspaceCommand(args))
