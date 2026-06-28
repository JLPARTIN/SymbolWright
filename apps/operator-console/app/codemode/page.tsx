'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import styles from './codemode.module.css'

type GovernanceMode = 'strict' | 'standard' | 'off'
type ViewTab = 'console' | 'setup'

interface ConsoleEntry {
  readonly id: string
  readonly type: 'system' | 'operator' | 'codemind' | 'error' | 'running'
  readonly content: string
  readonly timestamp: string
}

interface ApiResponse {
  readonly output?: string
  readonly error?: string
  readonly command?: string
  readonly exitCode?: number
  readonly cwd?: string
  readonly governance?: string
}

const GOVERNANCE_LABELS: Record<GovernanceMode, string> = {
  strict: 'STRICT',
  standard: 'STANDARD',
  off: 'OFF',
}

const GOVERNANCE_DESCRIPTIONS: Record<GovernanceMode, string> = {
  strict: 'Planning-first mode. Uses read-only runtime commands where available.',
  standard: 'Default extracted AELIB mode. Uses normal CodeMind commands through the API route.',
  off: 'User-selected active mode. CodeMode does not force read-only flags when the command supports it.',
}

const STORAGE_KEY = 'codemind.codemode.console.v1'
const GOVERNANCE_KEY = 'codemind.codemode.governance.v1'

const SETUP_SCRIPT = `cd /workspaces/CodeMind
npm install
npm run build
cd apps/operator-console
npm install
npm run dev`

const QUICK_COMMANDS = [
  { label: 'Status', apiCommand: 'status', icon: '?' },
  { label: 'Doctor', apiCommand: 'doctor', icon: '+' },
  { label: 'Release', apiCommand: 'release-readiness', icon: '!' },
  { label: 'Scan', apiCommand: 'scan', icon: '>' },
  { label: 'Context', apiCommand: 'project-context', icon: '#' },
  { label: 'Runtime', apiCommand: 'runtime-status', icon: '~' },
]

function loadConsole(): ConsoleEntry[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as ConsoleEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveConsole(entries: readonly ConsoleEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-200)))
  } catch {
    // Ignore storage failures in private/mobile browser sessions.
  }
}

function loadGovernance(): GovernanceMode {
  if (typeof window === 'undefined') return 'standard'
  const stored = window.localStorage.getItem(GOVERNANCE_KEY)
  if (stored === 'strict' || stored === 'standard' || stored === 'off') return stored
  return 'standard'
}

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

function copyToClipboard(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => undefined)
  }
}

export default function CodeModePage() {
  const [governanceMode, setGovernanceMode] = useState<GovernanceMode>('standard')
  const [mission, setMission] = useState('')
  const [entries, setEntries] = useState<ConsoleEntry[]>([])
  const [activeTab, setActiveTab] = useState<ViewTab>('console')
  const [running, setRunning] = useState(false)
  const [copiedSetup, setCopiedSetup] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = loadConsole()
    if (stored.length > 0) {
      setEntries(stored)
    } else {
      setEntries([
        {
          id: 'welcome',
          type: 'system',
          content:
            'CodeMode — standalone CodeMind browser workspace extracted from AELIB. Type a mission below or click a quick command. Commands execute server-side through /api/codemode.',
          timestamp: timestamp(),
        },
      ])
    }
    setGovernanceMode(loadGovernance())
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  useEffect(() => {
    if (entries.length > 0) saveConsole(entries)
  }, [entries])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GOVERNANCE_KEY, governanceMode)
    }
  }, [governanceMode])

  const addEntry = useCallback((type: ConsoleEntry['type'], content: string): string => {
    const id = crypto.randomUUID()
    const entry: ConsoleEntry = { id, type, content, timestamp: timestamp() }
    setEntries((prev) => [...prev, entry])
    return id
  }, [])

  const updateEntry = useCallback((id: string, type: ConsoleEntry['type'], content: string) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, type, content, timestamp: timestamp() } : entry)),
    )
  }, [])

  const executeCommand = useCallback(
    async (apiCommand: string, label: string, missionText?: string) => {
      if (running) return
      setRunning(true)

      addEntry('operator', missionText !== undefined ? missionText : `> ${label}`)
      const runningId = addEntry('running', `Running ${label}...`)

      try {
        const response = await fetch('/api/codemode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: apiCommand,
            mission: missionText,
            governance: governanceMode,
          }),
        })

        const data = (await response.json()) as ApiResponse

        if (data.error !== undefined) {
          updateEntry(runningId, 'error', data.error)
        } else {
          const header = data.command !== undefined ? `$ ${data.command}` : `$ codemind ${apiCommand}`
          const exitInfo = data.exitCode !== undefined && data.exitCode !== 0 ? `\n[exit code: ${data.exitCode}]` : ''
          updateEntry(runningId, 'codemind', `${header}\n\n${data.output ?? '(no output)'}${exitInfo}`)
        }
      } catch (error) {
        updateEntry(
          runningId,
          'error',
          `Connection error: ${error instanceof Error ? error.message : String(error)}\n\nMake sure the CodeMode app is running from apps/operator-console and CodeMind has been built with npm run build.`,
        )
      } finally {
        setRunning(false)
      }
    },
    [running, governanceMode, addEntry, updateEntry],
  )

  const handleMissionSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      const text = mission.trim()
      if (text.length === 0 || running) return

      void executeCommand('runtime-run-readonly', governanceMode === 'off' ? 'Mission (active)' : 'Mission', text)
      setMission('')
    },
    [mission, running, governanceMode, executeCommand],
  )

  const handleProposePatch = useCallback(() => {
    const text = mission.trim()
    if (text.length === 0 || running) return
    void executeCommand('propose-patch', 'Propose Patch', text)
    setMission('')
  }, [mission, running, executeCommand])

  const clearConsole = useCallback(() => {
    setEntries([])
    window.localStorage.removeItem(STORAGE_KEY)
  }, [])

  const changeGovernance = useCallback(
    (mode: GovernanceMode) => {
      setGovernanceMode(mode)
      addEntry('system', `Governance changed to ${GOVERNANCE_LABELS[mode]}. ${GOVERNANCE_DESCRIPTIONS[mode]}`)
    },
    [addEntry],
  )

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <span className={styles.eyebrow}>Standalone CodeMind</span>
          <h1 className={styles.title}>CodeMode Workspace</h1>
        </div>
        <div className={styles.governanceControls}>
          {running && <span className={styles.runningIndicator}>RUNNING</span>}
          <button
            className={`${styles.govBtn} ${governanceMode === 'strict' ? styles.govBtnActive : ''}`}
            onClick={() => changeGovernance('strict')}
          >
            Strict
          </button>
          <button
            className={`${styles.govBtn} ${governanceMode === 'standard' ? styles.govBtnActive : ''}`}
            onClick={() => changeGovernance('standard')}
          >
            Standard
          </button>
          <button
            className={`${styles.govBtn} ${styles.govBtnDanger} ${governanceMode === 'off' ? styles.govBtnActive : ''}`}
            onClick={() => changeGovernance('off')}
          >
            Off
          </button>
        </div>
      </header>

      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${activeTab === 'console' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('console')}
        >
          Console
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'setup' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('setup')}
        >
          Setup
        </button>
        {activeTab === 'console' && entries.length > 0 && (
          <button className={styles.clearBtn} onClick={clearConsole}>
            Clear
          </button>
        )}
      </div>

      {activeTab === 'console' && (
        <>
          <div className={styles.quickBar}>
            {QUICK_COMMANDS.map((command) => (
              <button
                key={command.label}
                className={styles.quickBtn}
                onClick={() => executeCommand(command.apiCommand, command.label)}
                disabled={running}
              >
                <span className={styles.quickIcon}>{command.icon}</span>
                {command.label}
              </button>
            ))}
          </div>

          <div className={styles.terminal} role="log" aria-live="polite">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`${styles.entry} ${
                  entry.type === 'system'
                    ? styles.entrySystem
                    : entry.type === 'operator'
                      ? styles.entryOperator
                      : entry.type === 'error'
                        ? styles.entryError
                        : entry.type === 'running'
                          ? styles.entryRunning
                          : styles.entryCodemind
                }`}
              >
                <span className={styles.entryTime}>{entry.timestamp}</span>
                <span className={styles.entryPrefix}>
                  {entry.type === 'system'
                    ? '[sys]'
                    : entry.type === 'operator'
                      ? '[you]'
                      : entry.type === 'error'
                        ? '[err]'
                        : entry.type === 'running'
                          ? '[...]'
                          : '[codemind]'}
                </span>
                <pre className={styles.entryContent}>{entry.content}</pre>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form className={styles.inputBar} onSubmit={handleMissionSubmit}>
            <textarea
              className={styles.missionInput}
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              placeholder={
                governanceMode === 'strict'
                  ? 'Enter an inspection mission...'
                  : governanceMode === 'off'
                    ? 'Enter a CodeMind mission with governance set to off...'
                    : 'Enter a mission for CodeMind...'
              }
              rows={2}
              disabled={running}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleMissionSubmit(event)
                }
              }}
            />
            <div className={styles.inputActions}>
              <button type="submit" className={styles.sendBtn} disabled={mission.trim().length === 0 || running}>
                {running ? '...' : 'Run'}
              </button>
              <button
                type="button"
                className={styles.proposeBtn}
                disabled={mission.trim().length === 0 || running}
                onClick={handleProposePatch}
              >
                Propose
              </button>
            </div>
          </form>
        </>
      )}

      {activeTab === 'setup' && (
        <div className={styles.setupPanel}>
          <section className={styles.setupSection}>
            <h2 className={styles.setupTitle}>First-time setup</h2>
            <p className={styles.setupDesc}>
              CodeMode now lives inside standalone CodeMind. Build CodeMind first, then run the extracted operator console.
            </p>
            <div className={styles.setupCode}>
              <pre className={styles.setupPre}>{SETUP_SCRIPT}</pre>
              <button
                className={styles.setupCopyBtn}
                onClick={() => {
                  copyToClipboard(SETUP_SCRIPT)
                  setCopiedSetup(true)
                  setTimeout(() => setCopiedSetup(false), 1500)
                }}
              >
                {copiedSetup ? 'Copied' : 'Copy Setup Script'}
              </button>
            </div>
          </section>

          <section className={styles.setupSection}>
            <h2 className={styles.setupTitle}>How it works</h2>
            <p className={styles.setupDesc}>
              This is the AELIB CodeMode surface extracted into CodeMind. The browser talks to /api/codemode, and the API route runs standalone CodeMind through node dist/cli.js.
            </p>
            <div className={styles.statusGrid}>
              {[
                { label: 'Workspace', value: 'apps/operator-console' },
                { label: 'API', value: '/api/codemode' },
                { label: 'CLI', value: 'node dist/cli.js' },
                { label: 'Port', value: '3005' },
                { label: 'Governance', value: GOVERNANCE_LABELS[governanceMode] },
              ].map((item) => (
                <div key={item.label} className={styles.statusItem}>
                  <span className={styles.statusLabel}>{item.label}</span>
                  <span className={styles.statusValue}>{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
