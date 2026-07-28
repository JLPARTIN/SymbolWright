import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const text = readFileSync(path, 'utf8')
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one occurrence, found ${count}`)
  writeFileSync(path, text.replace(before, after))
}

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `} from './sandbox-container-command-plan.js'
`,
  `} from './sandbox-container-command-plan.js'
import { serializeSandboxContainerInput } from './sandbox-container-transfer.js'
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `      const copiedIn = await this.command(
        this.plan.commands.copyIn,
        CONTROL_COMMAND_TIMEOUT_MS,
        CONTROL_COMMAND_OUTPUT_BYTES,
      )
`,
  `      const copyInPayload = await serializeSandboxContainerInput(workspace)
      const copiedIn = await this.command(
        this.plan.commands.copyIn,
        CONTROL_COMMAND_TIMEOUT_MS,
        CONTROL_COMMAND_OUTPUT_BYTES,
        copyInPayload,
      )
`,
)

if (existsSync('sandbox-pr3-container-diagnostic.txt')) {
  rmSync('sandbox-pr3-container-diagnostic.txt')
}
rmSync('scripts/apply-sandbox-pr3-stream-copy-in.mjs')
