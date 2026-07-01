import fs from 'node:fs'
import path from 'node:path'

import { normalizeRepoPath } from './file-classifier.js'
import type {
  FailureLedger,
  FailureLedgerLoadResult,
  FailureRecord,
  MatchedFailureRule,
} from './types.js'

const LEDGER_PATH = path.join('.codemind', 'ci-failure-ledger.json')

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFailureRecord(value: unknown): value is FailureRecord {
  if (!isObject(value)) {
    return false
  }

  const affectedFilePatterns = value['affectedFilePatterns']

  return (
    typeof value['failureClass'] === 'string' &&
    typeof value['rootCause'] === 'string' &&
    typeof value['preventionRule'] === 'string' &&
    typeof value['regressionTest'] === 'string' &&
    typeof value['firstSeen'] === 'string' &&
    (value['status'] === 'active' || value['status'] === 'inactive') &&
    Array.isArray(affectedFilePatterns) &&
    affectedFilePatterns.every((pattern) => typeof pattern === 'string')
  )
}

function isFailureLedger(value: unknown): value is FailureLedger {
  if (!isObject(value)) {
    return false
  }

  const failures = value['failures']

  return (
    typeof value['schemaVersion'] === 'number' &&
    Array.isArray(failures) &&
    failures.every((failure) => isFailureRecord(failure))
  )
}

export function failureLedgerPath(repoRoot: string): string {
  return path.join(repoRoot, LEDGER_PATH)
}

export function loadFailureLedger(repoRoot: string): FailureLedgerLoadResult {
  const ledgerPath = failureLedgerPath(repoRoot)

  if (!fs.existsSync(ledgerPath)) {
    return { ok: false, error: `${LEDGER_PATH} is missing` }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as unknown
    if (!isFailureLedger(parsed)) {
      return {
        ok: false,
        error: `${LEDGER_PATH} must be an object with schemaVersion:number and failures:array`,
      }
    }
    return { ok: true, ledger: parsed }
  } catch (error) {
    return {
      ok: false,
      error: `${LEDGER_PATH} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function globToRegex(glob: string): RegExp {
  const tokenSlash = '__CODEMIND_GLOBSTAR_SLASH__'
  const tokenStar = '__CODEMIND_GLOBSTAR__'
  const escaped = normalizeRepoPath(glob)
    .replace(/[.+^${}()|[\]\\]/g, String.fromCharCode(92) + '$&')
    .replaceAll('**/', tokenSlash)
    .replaceAll('**', tokenStar)
    .replaceAll('*', '[^/]*')
    .replaceAll(tokenSlash, '(?:.*/)?')
    .replaceAll(tokenStar, '.*')

  return new RegExp(`^${escaped}$`)
}

export function matchFailureLedgerRules(
  ledger: FailureLedger,
  changedFiles: readonly string[],
): readonly MatchedFailureRule[] {
  const normalizedFiles = changedFiles.map((filePath) => normalizeRepoPath(filePath))
  const matches: MatchedFailureRule[] = []

  for (const failure of ledger.failures) {
    if (failure.status !== 'active') {
      continue
    }

    for (const pattern of failure.affectedFilePatterns) {
      const regex = globToRegex(pattern)
      for (const filePath of normalizedFiles) {
        if (regex.test(filePath)) {
          matches.push({
            failureClass: failure.failureClass,
            affectedFile: filePath,
            pattern,
            preventionRule: failure.preventionRule,
            regressionTest: failure.regressionTest,
          })
        }
      }
    }
  }

  return matches
}
