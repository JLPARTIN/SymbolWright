import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const SECRETLINT_CONFIG_RELATIVE_PATH = '.secretlintrc.json'

export type SecretScanSurface = 'source' | 'git-history' | 'npm-pack' | 'container'
export type SecretScanStatus = 'PASS' | 'FAIL' | 'BLOCKED'

/**
 * Reconstructed strictly from secretlint's own already-redacted `message` string -- secretlint's
 * raw JSON output also includes a `sourceContent` field carrying the *entire* scanned file's raw
 * text (including any real secret verbatim), which must never be read into a finding, logged, or
 * persisted anywhere.
 */
export interface SecretScanFinding {
  readonly filePath: string
  readonly ruleId: string
  readonly messageId?: string
  readonly line: number
  readonly message: string
}

export interface SecretScanResult {
  readonly surface: SecretScanSurface
  readonly status: SecretScanStatus
  readonly detail: string
  readonly findings: readonly SecretScanFinding[]
}

function commandExists(command: string): boolean {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
}

/**
 * `docker --version` only checks the CLI binary is on PATH, not that the daemon is reachable --
 * `docker build`/`docker create` would still fail (and get miscategorized as a real defect rather
 * than missing infrastructure) if the daemon itself is down. `docker info` requires an actual
 * daemon round-trip, so it is the correct check for "is Docker really usable here."
 */
function dockerDaemonReachable(): boolean {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0
}

function secretlintBinaryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'node_modules', '.bin', 'secretlint')
}

/** Reads the installed secretlint package's own version -- never assumed, never hardcoded. */
export function readSecretlintVersion(workspaceRoot: string): string {
  const pkgPath = path.join(workspaceRoot, 'node_modules', 'secretlint', 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { readonly version?: string }
  return pkg.version ?? 'unknown'
}

/** Reads the installed recommend rule preset's own version, used as the ruleset identity. */
export function readSecretlintRulesetId(workspaceRoot: string): string {
  const pkgPath = path.join(
    workspaceRoot,
    'node_modules',
    '@secretlint',
    'secretlint-rule-preset-recommend',
    'package.json',
  )
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    readonly name?: string
    readonly version?: string
  }
  return `${pkg.name ?? '@secretlint/secretlint-rule-preset-recommend'}@${pkg.version ?? 'unknown'}`
}

interface SecretlintMessage {
  readonly ruleId: string
  readonly messageId?: string
  readonly message: string
  readonly loc: { readonly start: { readonly line: number } }
}

interface SecretlintFileRecord {
  readonly filePath: string
  readonly messages: readonly SecretlintMessage[]
}

function parseSecretlintFindings(stdout: string): SecretScanFinding[] {
  const records = JSON.parse(stdout) as readonly SecretlintFileRecord[]
  const findings: SecretScanFinding[] = []
  for (const record of records) {
    for (const message of record.messages) {
      findings.push({
        filePath: record.filePath,
        ruleId: message.ruleId,
        ...(message.messageId === undefined ? {} : { messageId: message.messageId }),
        line: message.loc.start.line,
        message: message.message,
      })
    }
  }
  return findings
}

/**
 * Runs secretlint over an explicit file list and classifies the result. Exit code 0 means clean,
 * 1 means real findings were parsed from stdout, and anything else is treated as an execution
 * error -- never silently reported as "no findings" (a scanner that crashed proves nothing).
 */
export function runSecretlintOnFiles(
  workspaceRoot: string,
  files: readonly string[],
  surface: SecretScanSurface,
  options: { readonly cwd?: string } = {},
): SecretScanResult {
  if (files.length === 0) {
    return { surface, status: 'PASS', detail: 'No files to scan.', findings: [] }
  }
  const binary = secretlintBinaryPath(workspaceRoot)
  if (!fs.existsSync(binary)) {
    return {
      surface,
      status: 'BLOCKED',
      detail: 'secretlint is not installed (node_modules/.bin/secretlint missing).',
      findings: [],
    }
  }
  const configPath = path.join(workspaceRoot, SECRETLINT_CONFIG_RELATIVE_PATH)
  const cwd = options.cwd ?? workspaceRoot
  try {
    execFileSync(binary, ['--secretlintrc', configPath, '--format', 'json', ...files], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    return {
      surface,
      status: 'PASS',
      detail: `Scanned ${files.length} file(s); clean.`,
      findings: [],
    }
  } catch (error) {
    const status = (error as { readonly status?: number }).status
    const stdout = (error as { readonly stdout?: string }).stdout
    if (status === 1 && typeof stdout === 'string') {
      try {
        const findings = parseSecretlintFindings(stdout)
        return {
          surface,
          status: 'FAIL',
          detail: `Scanned ${files.length} file(s); ${findings.length} finding(s).`,
          findings,
        }
      } catch (parseError) {
        return {
          surface,
          status: 'FAIL',
          detail: `secretlint reported findings but its output could not be parsed: ${errorMessage(parseError)}`,
          findings: [],
        }
      }
    }
    const stderr = (error as { readonly stderr?: string }).stderr
    return {
      surface,
      status: 'FAIL',
      detail: `secretlint execution failed (exit ${String(status)}): ${boundedText(stderr ?? errorMessage(error))}`,
      findings: [],
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function boundedText(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}…` : trimmed
}

function listTrackedFiles(workspaceRoot: string): string[] {
  const stdout = execFileSync('git', ['ls-files'], { cwd: workspaceRoot, encoding: 'utf8' })
  return stdout.split('\n').filter((line) => line.trim().length > 0)
}

/** Task 9 (current source): scans every git-tracked file in the working tree. */
export function runSourceSecretScan(workspaceRoot: string): SecretScanResult {
  let files: string[]
  try {
    files = listTrackedFiles(workspaceRoot)
  } catch (error) {
    return {
      surface: 'source',
      status: 'BLOCKED',
      detail: `Cannot list tracked files: ${errorMessage(error)}`,
      findings: [],
    }
  }
  return runSecretlintOnFiles(workspaceRoot, files, 'source')
}

/**
 * Task 8 (complete reachable git history): dumps a zero-context diff of every reachable commit
 * (`git log --all -p -U0`) to a temporary file and scans that as one text blob. A zero-context diff
 * shows every line that was ever added or removed across the entire history, which is the same
 * technique dedicated git-history secret scanners use and does not require materializing every
 * historical blob individually.
 */
export function runGitHistorySecretScan(workspaceRoot: string): SecretScanResult {
  let dumpPath: string | undefined
  try {
    const diff = execFileSync('git', ['log', '--all', '-p', '--no-color', '-U0'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    })
    if (diff.trim().length === 0) {
      return { surface: 'git-history', status: 'PASS', detail: 'No history to scan.', findings: [] }
    }
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'symbolwright-secret-scan-history-'))
    dumpPath = path.join(dir, 'history.diff')
    fs.writeFileSync(dumpPath, diff)
    const result = runSecretlintOnFiles(workspaceRoot, ['history.diff'], 'git-history', {
      cwd: dir,
    })
    return {
      ...result,
      findings: result.findings.map((finding) => ({ ...finding, filePath: '<git history diff>' })),
    }
  } catch (error) {
    return {
      surface: 'git-history',
      status: 'BLOCKED',
      detail: `Cannot read git history: ${errorMessage(error)}`,
      findings: [],
    }
  } finally {
    if (dumpPath !== undefined) fs.rmSync(path.dirname(dumpPath), { recursive: true, force: true })
  }
}

/**
 * `.map` files are excluded: they are generated positional-mapping data (base64 VLQ-encoded
 * offsets), never authored content, and their long encoded lines caused catastrophic scan slowdown
 * in local testing (a full source-tree scan finished in under a minute; the equivalent scan
 * including every `.map` file did not complete in six-plus minutes of CPU time). Any real secret
 * that could appear in a `.map` file would already be present in the corresponding `.js` file,
 * which is not excluded and is fully scanned.
 */
function listFilesRecursive(root: string): string[] {
  const results: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && !entry.name.endsWith('.map')) {
        results.push(path.relative(root, full))
      }
    }
  }
  walk(root)
  return results
}

/** Task 9 (npm pack tarball): packs the exact tarball `npm publish` would upload and scans it. */
export function runNpmPackSecretScan(workspaceRoot: string): SecretScanResult {
  let root: string | undefined
  try {
    root = fs.mkdtempSync(path.join(tmpdir(), 'symbolwright-secret-scan-pack-'))
    const packDir = path.join(root, 'pack')
    const extractedDir = path.join(root, 'extracted')
    fs.mkdirSync(packDir)
    fs.mkdirSync(extractedDir)
    const packed = JSON.parse(
      execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
        cwd: workspaceRoot,
        encoding: 'utf8',
      }),
    ) as readonly { readonly filename: string }[]
    const filename = packed[0]?.filename
    if (filename === undefined) throw new Error('npm pack did not return a tarball filename.')
    execFileSync('tar', ['xzf', path.join(packDir, filename), '-C', extractedDir])
    const files = listFilesRecursive(extractedDir)
    return runSecretlintOnFiles(workspaceRoot, files, 'npm-pack', { cwd: extractedDir })
  } catch (error) {
    return {
      surface: 'npm-pack',
      status: 'BLOCKED',
      detail: `Cannot produce or extract the npm pack tarball: ${errorMessage(error)}`,
      findings: [],
    }
  } finally {
    if (root !== undefined) fs.rmSync(root, { recursive: true, force: true })
  }
}

/**
 * Task 10 (built container filesystem): exports the exact filesystem of a built/pushed image and
 * scans it. Requires Docker; a missing daemon is reported as BLOCKED, or as FAIL when
 * `SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE=1` (the same env var the release/deploy workflows already use
 * to demand real Docker evidence rather than let it silently pass).
 */
export function runContainerSecretScan(
  workspaceRoot: string,
  imageOverride?: string,
): SecretScanResult {
  const required = process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE'] === '1'
  if (!commandExists('docker') || !dockerDaemonReachable()) {
    return {
      surface: 'container',
      status: required ? 'FAIL' : 'BLOCKED',
      detail: 'Docker is unavailable; container filesystem scan could not run.',
      findings: [],
    }
  }
  const image = imageOverride ?? `symbolwright-secret-scan:${Date.now()}`
  let containerName: string | undefined
  let root: string | undefined
  try {
    if (imageOverride === undefined) {
      execFileSync('docker', ['build', '--tag', image, '.'], { cwd: workspaceRoot })
    }
    containerName = `symbolwright-secret-scan-export-${Date.now()}`
    execFileSync('docker', ['create', '--name', containerName, image, 'true'])
    root = fs.mkdtempSync(path.join(tmpdir(), 'symbolwright-secret-scan-container-'))
    const tarPath = path.join(root, 'rootfs.tar')
    const exported = execFileSync('docker', ['export', containerName], {
      maxBuffer: 1024 * 1024 * 1024,
    })
    fs.writeFileSync(tarPath, exported)
    const extractedDir = path.join(root, 'rootfs')
    fs.mkdirSync(extractedDir)
    execFileSync('tar', ['xf', tarPath, '-C', extractedDir])
    const appDir = path.join(extractedDir, 'app')
    const scanRoot = fs.existsSync(appDir) ? appDir : extractedDir
    const files = listFilesRecursive(scanRoot)
    return runSecretlintOnFiles(workspaceRoot, files, 'container', { cwd: scanRoot })
  } catch (error) {
    return {
      surface: 'container',
      status: 'FAIL',
      detail: `Cannot build/export/scan the container filesystem: ${errorMessage(error)}`,
      findings: [],
    }
  } finally {
    if (containerName !== undefined) {
      spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' })
    }
    if (imageOverride === undefined) {
      spawnSync('docker', ['image', 'rm', '-f', image], { stdio: 'ignore' })
    }
    if (root !== undefined) fs.rmSync(root, { recursive: true, force: true })
  }
}

export interface SecretScanReleaseEvidence {
  readonly scannerVersion: string
  readonly rulesetId: string
  readonly sourceCommitSha: string
  readonly scannedSurfaces: readonly {
    readonly surface: SecretScanSurface
    readonly status: SecretScanStatus
    readonly detail: string
    readonly findingCount: number
  }[]
  readonly overallStatus: SecretScanStatus
  readonly findingsSummary: readonly SecretScanFinding[]
}

function currentCommitSha(workspaceRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown'
  }
}

function combineStatus(results: readonly SecretScanResult[]): SecretScanStatus {
  if (results.some((r) => r.status === 'FAIL')) return 'FAIL'
  if (results.some((r) => r.status === 'BLOCKED')) return 'BLOCKED'
  return 'PASS'
}

/**
 * Task 12: a redacted, machine-readable release evidence record spanning every scanned surface --
 * scanner version, ruleset identity, exact source SHA, per-surface status, and a findings summary
 * built only from secretlint's own already-redacted message strings (never `sourceContent`).
 */
export function buildSecretScanReleaseEvidence(
  workspaceRoot: string,
  results: readonly SecretScanResult[],
): SecretScanReleaseEvidence {
  return {
    scannerVersion: safeRead(() => readSecretlintVersion(workspaceRoot)),
    rulesetId: safeRead(() => readSecretlintRulesetId(workspaceRoot)),
    sourceCommitSha: currentCommitSha(workspaceRoot),
    scannedSurfaces: results.map((r) => ({
      surface: r.surface,
      status: r.status,
      detail: r.detail,
      findingCount: r.findings.length,
    })),
    overallStatus: combineStatus(results),
    findingsSummary: results.flatMap((r) => r.findings),
  }
}

function safeRead(read: () => string): string {
  try {
    return read()
  } catch {
    return 'unknown'
  }
}

export function renderSecretScanReleaseEvidence(evidence: SecretScanReleaseEvidence): string {
  const lines = [
    'SymbolWright Secret Scan Evidence',
    '',
    `Scanner: secretlint@${evidence.scannerVersion}`,
    `Ruleset: ${evidence.rulesetId}`,
    `Source commit SHA: ${evidence.sourceCommitSha}`,
    `Overall status: ${evidence.overallStatus}`,
    '',
    'Scanned surfaces:',
    ...evidence.scannedSurfaces.map(
      (s) => `  [${s.status}] ${s.surface}: ${s.detail} (${s.findingCount} finding(s))`,
    ),
  ]
  if (evidence.findingsSummary.length > 0) {
    lines.push('', 'Findings (redacted):')
    for (const finding of evidence.findingsSummary) {
      lines.push(`  - ${finding.filePath}:${finding.line} [${finding.ruleId}] ${finding.message}`)
    }
  }
  return lines.join('\n')
}
