import fs, { type Dirent } from 'node:fs'
import path from 'node:path'

export const FINAL_SANDBOX_AUDIT_RELATIVE_PATH = path.join(
  'docs',
  'security',
  'SANDBOX_FINAL_ADVERSARIAL_AUDIT.md',
)

export type ReleaseClosureIntegrityStatus = 'PASS' | 'FAIL'

export interface ReleaseClosureIntegrityReport {
  readonly status: ReleaseClosureIntegrityStatus
  readonly findings: readonly string[]
}

interface ForbiddenDirectoryRule {
  readonly relativeDirectory: string
  readonly isForbidden: (name: string) => boolean
}

/**
 * Matches any bundle-numbered temporary-release-machinery prefix (`pr7-`, `pr42_`, ...) so a future
 * bundle's own scratch files are caught the same way earlier ones were, without hardcoding a bundle
 * number that will eventually be wrong again.
 */
const NUMBERED_BUNDLE_PREFIX_PATTERN = /^pr\d+[-_]/i

const FORBIDDEN_DIRECTORY_RULES: readonly ForbiddenDirectoryRule[] = [
  {
    relativeDirectory: '.github',
    isForbidden: (name) => NUMBERED_BUNDLE_PREFIX_PATTERN.test(name),
  },
  {
    relativeDirectory: path.join('.github', 'workflows'),
    isForbidden: (name) => NUMBERED_BUNDLE_PREFIX_PATTERN.test(name),
  },
  {
    relativeDirectory: path.join('docs', 'security'),
    isForbidden: (name) => NUMBERED_BUNDLE_PREFIX_PATTERN.test(name),
  },
]

/**
 * Name-based markers for temporary or self-modifying release machinery, independent of any bundle
 * number: trigger files, workplans, "do not merge"/"not for merge" notes, draft markers, findings
 * ledgers, and auto-commit/self-modifying automation. Deliberately narrow and keyword-anchored
 * (not a bare substring like "temp" or "diagnostic") so a legitimate product file is never caught
 * by an incidental word in its name.
 */
const FORBIDDEN_RELEASE_FILENAME =
  /(?:^|[_-])(DO_NOT_MERGE|NOT_FOR_MERGE|DRAFT_MARKER|TEMPORARY_FILE_MANIFEST|TRIGGER|WORKPLAN|FINDINGS_LEDGER|AUTO_COMMIT|SELF_MODIFYING)(?:[-_.]|$)/i
const CONTENTS_WRITE_PATTERN = /^\s*contents:\s*write(?:\s+#.*)?$/m
const PINNED_ACTION_REF_PATTERN = /^[0-9a-f]{40}$/i

/**
 * Shared with `release-candidate.ts`, which validates the same "`Audited code SHA:` .../
 * `Release verdict:` ..." convention against whatever audit document a release candidate manifest
 * references, not only the fixed sandbox audit path this module itself checks.
 */
export const AUDITED_SHA_PATTERN = /\*{0,2}Audited code SHA:\*{0,2}\s*`[0-9a-f]{40}`/
export const RELEASE_VERDICT_PATTERN =
  /\*{0,2}Release verdict:\*{0,2}\s*\*\*(PASS|FAIL|BLOCKED|NOT RUN)\*\*/

/**
 * Verifies that a release candidate does not contain temporary audit machinery and that its final
 * security evidence is present, exact-revision-bound, and backed by immutable workflow actions.
 */
export function assessReleaseClosureIntegrity(
  workspaceRoot: string,
): ReleaseClosureIntegrityReport {
  const findings: string[] = []
  const root = path.resolve(workspaceRoot)

  if (!isDirectory(root)) {
    return {
      status: 'FAIL',
      findings: Object.freeze([`Workspace root is missing or not a directory: ${root}`]),
    }
  }

  findTemporaryReleaseArtifacts(root, findings)
  verifyFinalSandboxAudit(root, findings)
  verifyWorkflowIntegrity(root, findings)

  return {
    status: findings.length === 0 ? 'PASS' : 'FAIL',
    findings: Object.freeze(findings.sort()),
  }
}

function findTemporaryReleaseArtifacts(root: string, findings: string[]): void {
  for (const rule of FORBIDDEN_DIRECTORY_RULES) {
    const directory = path.join(root, rule.relativeDirectory)
    for (const entry of readDirectory(directory)) {
      if (rule.isForbidden(entry.name) || FORBIDDEN_RELEASE_FILENAME.test(entry.name)) {
        findings.push(
          `Temporary release artifact remains: ${path.join(rule.relativeDirectory, entry.name)}`,
        )
      }
    }
  }
}

function verifyFinalSandboxAudit(root: string, findings: string[]): void {
  const auditPath = path.join(root, FINAL_SANDBOX_AUDIT_RELATIVE_PATH)
  if (!isFile(auditPath)) {
    findings.push(
      `Final sandbox adversarial audit is missing: ${FINAL_SANDBOX_AUDIT_RELATIVE_PATH}`,
    )
    return
  }

  let content: string
  try {
    content = fs.readFileSync(auditPath, 'utf8')
  } catch {
    findings.push(
      `Final sandbox adversarial audit cannot be read: ${FINAL_SANDBOX_AUDIT_RELATIVE_PATH}`,
    )
    return
  }

  if (!AUDITED_SHA_PATTERN.test(content)) {
    findings.push(
      'Final sandbox adversarial audit does not record an exact 40-character audited code SHA',
    )
  }

  const verdict = RELEASE_VERDICT_PATTERN.exec(content)?.[1]
  if (verdict === undefined) {
    findings.push('Final sandbox adversarial audit does not record a valid release verdict')
  } else if (verdict !== 'PASS') {
    findings.push(`Final sandbox adversarial audit release verdict is ${verdict}, not PASS`)
  }
}

function verifyWorkflowIntegrity(root: string, findings: string[]): void {
  const relativeDirectory = path.join('.github', 'workflows')
  const workflowDirectory = path.join(root, relativeDirectory)

  for (const entry of readDirectory(workflowDirectory)) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue

    const relativePath = path.join(relativeDirectory, entry.name)
    const absolutePath = path.join(workflowDirectory, entry.name)
    let content: string
    try {
      content = fs.readFileSync(absolutePath, 'utf8')
    } catch {
      findings.push(`Workflow cannot be read: ${relativePath}`)
      continue
    }

    if (CONTENTS_WRITE_PATTERN.test(content)) {
      findings.push(`Unexpected contents: write workflow permission: ${relativePath}`)
    }

    for (const reference of actionReferences(content)) {
      if (!isImmutableActionReference(reference)) {
        findings.push(`Workflow action is not commit-SHA pinned: ${relativePath} -> ${reference}`)
      }
    }
  }
}

function actionReferences(content: string): readonly string[] {
  const references: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:-\s*)?uses:\s*(.+?)\s*$/.exec(line)
    if (match === null) continue
    const withoutComment = (match[1] ?? '').replace(/\s+#.*$/, '').trim()
    const unquoted = withoutComment.replace(/^(['"])(.*)\1$/, '$2')
    if (unquoted.length > 0) references.push(unquoted)
  }
  return references
}

function isImmutableActionReference(reference: string): boolean {
  if (reference.startsWith('./') || reference.startsWith('docker://')) return true
  const separator = reference.lastIndexOf('@')
  if (separator <= 0 || separator === reference.length - 1) return false
  return PINNED_ACTION_REF_PATTERN.test(reference.slice(separator + 1))
}

function readDirectory(directory: string): readonly Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}
