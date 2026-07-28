import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const path = 'src/sandbox/sandbox-container-backend.ts'
let text = readFileSync(path, 'utf8')

const earlyReturn = `        return this.finalResult({
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
        })`
const earlyReturnCount = text.split(earlyReturn).length - 1
if (earlyReturnCount !== 2) {
  throw new Error(`expected two pre-cleanup result returns, found ${earlyReturnCount}`)
}
text = text.replaceAll(earlyReturn, `        throw new SandboxContainerTerminalError(status, stderr)`)

const oldCatch = `    } catch (error) {
      if (this.cancelled) status = 'cancelled'
      else if (error instanceof SandboxWorkspaceBoundaryError) status = 'policy-blocked'
      else status = 'internal-error'
      const message = error instanceof Error ? error.message : String(error)
      stderr = stderr.length === 0 ? boundedMessage(message) : stderr
      diagnostics.push({ severity: 'error', message: boundedMessage(message) })`
const newCatch = `    } catch (error) {
      if (this.cancelled) status = 'cancelled'
      else if (error instanceof SandboxContainerTerminalError) status = error.status
      else if (error instanceof SandboxWorkspaceBoundaryError) status = 'policy-blocked'
      else status = 'internal-error'
      const message = error instanceof Error ? error.message : String(error)
      stderr = stderr.length === 0 ? boundedMessage(message) : stderr
      if (!(error instanceof SandboxContainerTerminalError)) {
        diagnostics.push({ severity: 'error', message: boundedMessage(message) })
      }`
if (!text.includes(oldCatch)) throw new Error('container catch block not found')
text = text.replace(oldCatch, newCatch)

const standaloneStart = `    let timedOut = false
    child.stdout.on('data', (chunk: Buffer) => {`
if (!text.includes(standaloneStart)) throw new Error('standalone command state not found')
text = text.replace(
  standaloneStart,
  `    let timedOut = false
    let settled = false
    child.stdout.on('data', (chunk: Buffer) => {`,
)

const standaloneError = `    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({`
if (!text.includes(standaloneError)) throw new Error('standalone error handler not found')
text = text.replace(
  standaloneError,
  `    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({`,
)

const standaloneClose = `    child.once('close', (code, closeSignal) => {
      clearTimeout(timer)
      resolve({`
if (!text.includes(standaloneClose)) throw new Error('standalone close handler not found')
text = text.replace(
  standaloneClose,
  `    child.once('close', (code, closeSignal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({`,
)

writeFileSync(path, text)
rmSync('scripts/apply-sandbox-pr3-evidence-quality.mjs')
