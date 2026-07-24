#!/usr/bin/env node
// Stops the CodeMind Codespaces server started by codespaces-start.mjs.
// Only ever signals a PID whose /proc/<pid>/environ carries the exact
// marker this repo's start script set when it launched it -- an unrelated
// process (even another `node`, even a PID that got reused after a reboot)
// is left alone.
import { pathToFileURL } from 'node:url'

import {
  PID_FILE,
  isProcessAlive,
  isTrackedCodemindProcess,
  readPidRecord,
  removePidFile,
} from './lib/codespaces-common.mjs'

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return !isProcessAlive(pid)
}

/** Stops the tracked server if one is running and verified. Safe to call when nothing is running. */
export async function stopTrackedServer({ quiet = false } = {}) {
  const say = (message) => {
    if (!quiet) console.log(message)
  }

  const record = readPidRecord()
  if (record === undefined) {
    say('No tracked CodeMind server is recorded.')
    return { stopped: false, reason: 'not-tracked' }
  }

  if (!isProcessAlive(record.pid)) {
    say(`Tracked PID ${record.pid} is no longer running; clearing stale ${PID_FILE}.`)
    removePidFile()
    return { stopped: false, reason: 'already-stopped' }
  }

  if (!isTrackedCodemindProcess(record.pid, record.marker)) {
    say(
      `PID ${record.pid} is alive but is not the CodeMind server this repo started (marker mismatch, ` +
        `likely PID reuse). Not sending it any signal. Clearing the stale PID record.`,
    )
    removePidFile()
    return { stopped: false, reason: 'marker-mismatch' }
  }

  say(`Stopping CodeMind server (PID ${record.pid})...`)
  process.kill(record.pid, 'SIGTERM')
  const exitedCleanly = await waitForExit(record.pid, 8_000)

  if (!exitedCleanly && isProcessAlive(record.pid)) {
    say(`PID ${record.pid} did not exit after SIGTERM; sending SIGKILL.`)
    try {
      process.kill(record.pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
    await waitForExit(record.pid, 3_000)
  }

  removePidFile()
  say('Stopped.')
  return { stopped: true, reason: 'stopped' }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  stopTrackedServer({ quiet: false }).catch((error) => {
    console.error('codespaces:stop failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
