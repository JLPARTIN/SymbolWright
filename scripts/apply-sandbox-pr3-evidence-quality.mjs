import { readFileSync, rmSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const text = readFileSync(path, 'utf8')
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${path}: expected one occurrence, found ${count}`)
  writeFileSync(path, text.replace(before, after))
}

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `interface CommandOutcome {
  readonly exitCode: number | null
  readonly signal?: string
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  readonly cancelled: boolean
  readonly outputLimited: boolean
}
`,
  `interface CommandOutcome {
  readonly exitCode: number | null
  readonly signal?: string
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  readonly cancelled: boolean
  readonly outputLimited: boolean
}

class SandboxContainerTerminalError extends Error {
  public constructor(
    public readonly status: SandboxExecutionResult['status'],
    message: string,
  ) {
    super(message)
  }
}
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `        return this.finalResult({
          started,
          status,
          stdout,
          stderr,
          outputTruncated,
          verificationLevel,
          artifacts,
          diagnostics,
          cleanupAttempted,
          cleanupSucceeded,
          cleanupWarnings,
        })
`,
  `        throw new SandboxContainerTerminalError(status, stderr)
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `        return this.finalResult({
          started,
          status,
          stdout,
          stderr,
          outputTruncated,
          verificationLevel,
          artifacts,
          diagnostics,
          cleanupAttempted,
          cleanupSucceeded,
          cleanupWarnings,
        })
`,
  `        throw new SandboxContainerTerminalError(status, stderr)
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `    } catch (error) {
      if (this.cancelled) status = 'cancelled'
      else if (error instanceof SandboxWorkspaceBoundaryError) status = 'policy-blocked'
      else status = 'internal-error'
      const message = error instanceof Error ? error.message : String(error)
      stderr = stderr.length === 0 ? boundedMessage(message) : stderr
      diagnostics.push({ severity: 'error', message: boundedMessage(message) })
`,
  `    } catch (error) {
      if (this.cancelled) status = 'cancelled'
      else if (error instanceof SandboxContainerTerminalError) status = error.status
      else if (error instanceof SandboxWorkspaceBoundaryError) status = 'policy-blocked'
      else status = 'internal-error'
      const message = error instanceof Error ? error.message : String(error)
      stderr = stderr.length === 0 ? boundedMessage(message) : stderr
      if (!(error instanceof SandboxContainerTerminalError)) {
        diagnostics.push({ severity: 'error', message: boundedMessage(message) })
      }
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `    let timedOut = false
    child.stdout.on('data', (chunk: Buffer) => {
`,
  `    let timedOut = false
    let settled = false
    child.stdout.on('data', (chunk: Buffer) => {
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({
`,
  `    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-backend.ts',
  `    child.once('close', (code, closeSignal) => {
      clearTimeout(timer)
      resolve({
`,
  `    child.once('close', (code, closeSignal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
`,
)

replaceOnce(
  'src/sandbox/sandbox-container-workspace.ts',
  `const TEXT_PATCH_MAX_FILE_BYTES = 512 * 1024
`,
  ``,
)
replaceOnce(
  'src/sandbox/sandbox-container-workspace.ts',
  `  if (filePath.length <= TEXT_PATCH_MAX_FILE_BYTES) return 'application/octet-stream'
  return 'application/octet-stream'
`,
  `  return 'application/octet-stream'
`,
)

rmSync('scripts/apply-sandbox-pr3-evidence-quality.mjs')
