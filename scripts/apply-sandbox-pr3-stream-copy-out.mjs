import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const text = readFileSync(path, 'utf8')
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one occurrence, found ${count}`)
  writeFileSync(path, text.replace(before, after))
}

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `import { serializeSandboxContainerInput } from './sandbox-container-transfer.js'
`,
  `import {
  materializeSandboxContainerOutput,
  sandboxContainerCopyOutEncodedLimit,
  serializeSandboxContainerInput,
} from './sandbox-container-transfer.js'
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `      const copiedOut = await this.command(
        this.plan.commands.copyOut,
        CONTROL_COMMAND_TIMEOUT_MS,
        CONTROL_COMMAND_OUTPUT_BYTES,
      )
      if (copiedOut.exitCode !== 0) {
        diagnostics.push({
          severity: 'warning',
          message: \`Artifact copy-out failed: \${boundedMessage(copiedOut.stderr || copiedOut.stdout)}\`,
        })
      } else {
        const quarantine = await quarantineSandboxContainerArtifacts({
          executionId: this.input.executionId,
          workspace,
          limits: this.input.runner.limits,
        })
        artifacts = quarantine.artifacts
        diagnostics.push(
          ...quarantine.warnings.map((message) => ({ severity: 'warning' as const, message })),
        )
      }
`,
  `      const copiedOut = await this.command(
        this.plan.commands.copyOut,
        CONTROL_COMMAND_TIMEOUT_MS,
        sandboxContainerCopyOutEncodedLimit(this.input.runner.limits),
      )
      if (copiedOut.exitCode !== 0) {
        diagnostics.push({
          severity: 'warning',
          message: \`Artifact copy-out failed: \${boundedMessage(copiedOut.stderr || copiedOut.stdout)}\`,
        })
      } else {
        try {
          await materializeSandboxContainerOutput(
            workspace,
            copiedOut.stdout,
            this.input.runner.limits,
          )
          const quarantine = await quarantineSandboxContainerArtifacts({
            executionId: this.input.executionId,
            workspace,
            limits: this.input.runner.limits,
          })
          artifacts = quarantine.artifacts
          diagnostics.push(
            ...quarantine.warnings.map((message) => ({ severity: 'warning' as const, message })),
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          diagnostics.push({ severity: 'error', message: boundedMessage(message) })
          status = /quota|maxFiles|maxFileBytes|output limit|byte quota/i.test(message)
            ? 'resource-limit'
            : 'policy-blocked'
        }
      }
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-command-plan.spec.ts',
  `    expect(plan.commands.copyOut.join(' ')).toContain('docker cp')
`,
  `    expect(plan.commands.copyOut.join(' ')).toContain('docker exec')
    expect(plan.commands.copyOut.join(' ')).toContain('SYMBOLWRIGHT_COPY_OUT_MAX_FILES=')
    expect(plan.commands.copyOut.join(' ')).toContain('node -e')
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-integration.spec.ts',
  `        limits: { timeoutMs: 5_000, maxProcesses: 8 },
`,
  `        limits: { timeoutMs: 5_000, maxProcesses: 32 },
`,
)

if (existsSync('sandbox-pr3-container-diagnostic.txt')) {
  rmSync('sandbox-pr3-container-diagnostic.txt')
}
rmSync('scripts/apply-sandbox-pr3-stream-copy-out.mjs')
