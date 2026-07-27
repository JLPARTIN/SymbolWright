import type { AjnaReviewFinding } from './ajna-review.types.js'

/**
 * AJNA-9: security-sensitive path detector.
 *
 * Classifies changed file paths into security-sensitivity tiers using path
 * patterns alone (no diff content is required). Only path text is matched —
 * this never inspects file contents and never opens or reads the files
 * themselves, keeping the detector read-only-safe for any repository.
 */

export type AjnaSecuritySensitiveTier =
  'secrets-and-crypto' | 'auth-and-access-control' | 'supply-chain'

export interface AjnaSecuritySensitivePathRule {
  readonly tier: AjnaSecuritySensitiveTier
  readonly pattern: RegExp
  readonly label: string
}

export interface AjnaSecuritySensitivePolicy {
  readonly rules: readonly AjnaSecuritySensitivePathRule[]
}

const DEFAULT_RULES: readonly AjnaSecuritySensitivePathRule[] = [
  // secrets-and-crypto: highest tier — leaked or altered secrets/keys/crypto logic
  // are directly exploitable and always require an explicit operator decision.
  { tier: 'secrets-and-crypto', pattern: /(^|\/)\.env(\..+)?$/i, label: 'environment/secret file' },
  {
    tier: 'secrets-and-crypto',
    pattern: /secrets?[/.]|[/.]secrets?/i,
    label: 'secret storage path',
  },
  { tier: 'secrets-and-crypto', pattern: /credentials?/i, label: 'credential path' },
  {
    tier: 'secrets-and-crypto',
    pattern: /\.(pem|key|pfx|p12|jks)$/i,
    label: 'private key/keystore file',
  },
  {
    tier: 'secrets-and-crypto',
    pattern: /\b(crypto|cipher|encrypt|decrypt|hmac)\b/i,
    label: 'cryptography path',
  },
  // auth-and-access-control: identity, session, and permission logic — a bug
  // here changes who can act as whom or what they are allowed to do.
  {
    tier: 'auth-and-access-control',
    pattern: /\bauth(entic|oriz)?\w*\b/i,
    label: 'authentication/authorization path',
  },
  {
    tier: 'auth-and-access-control',
    pattern: /\b(session|oauth|jwt|sso)\b/i,
    label: 'session/identity path',
  },
  {
    tier: 'auth-and-access-control',
    pattern: /\b(permission|acl|rbac)\b/i,
    label: 'access-control path',
  },
  {
    tier: 'auth-and-access-control',
    pattern: /approval[-_]?ticket|runtime[-_]?policy|validation[-_]?command[-_]?gate/i,
    label: 'execution/approval gate path',
  },
  // supply-chain: CI, container, and dependency-lock changes are lower
  // per-file risk but change what code runs and how it is built/shipped.
  { tier: 'supply-chain', pattern: /(^|\/)\.github\/workflows\//i, label: 'CI workflow file' },
  { tier: 'supply-chain', pattern: /(^|\/)Dockerfile(\..+)?$/i, label: 'container build file' },
  { tier: 'supply-chain', pattern: /docker-compose/i, label: 'container orchestration file' },
  {
    tier: 'supply-chain',
    pattern:
      /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Gemfile\.lock|go\.sum|Cargo\.lock|composer\.lock)$/i,
    label: 'dependency lockfile',
  },
]

export const DEFAULT_AJNA_SECURITY_SENSITIVE_POLICY: AjnaSecuritySensitivePolicy = {
  rules: DEFAULT_RULES,
}

const TIER_RISK: Readonly<Record<AjnaSecuritySensitiveTier, AjnaReviewFinding['risk']>> = {
  'secrets-and-crypto': 'CRITICAL',
  'auth-and-access-control': 'HIGH',
  'supply-chain': 'MEDIUM',
}

const TIER_BLOCKS_MERGE: Readonly<Record<AjnaSecuritySensitiveTier, boolean>> = {
  'secrets-and-crypto': true,
  'auth-and-access-control': true,
  'supply-chain': false,
}

const TIER_TITLE: Readonly<Record<AjnaSecuritySensitiveTier, string>> = {
  'secrets-and-crypto': 'Secret or cryptography path changed',
  'auth-and-access-control': 'Authentication or access-control path changed',
  'supply-chain': 'Supply-chain path changed',
}

const TIER_RECOMMENDATION: Readonly<Record<AjnaSecuritySensitiveTier, string>> = {
  'secrets-and-crypto':
    'An operator must confirm no secret material was introduced and that cryptographic behavior is intentional before merge.',
  'auth-and-access-control':
    'An operator must confirm identity, session, or permission semantics were not weakened before merge.',
  'supply-chain':
    'Confirm the CI, container, or dependency-lock change was intentional; this does not block merge by itself.',
}

interface MatchedFile {
  readonly file: string
  readonly label: string
}

/**
 * Detects security-sensitive changed paths and returns one aggregated
 * SECURITY_SENSITIVE_CHANGE finding per matched tier. Findings are read-only
 * classification only: Ajna records the risk and required review, but the
 * merge-readiness engine (not this detector) decides what blocks a merge.
 */
export function detectAjnaSecuritySensitivePaths(
  changedFiles: readonly string[],
  policy: AjnaSecuritySensitivePolicy = DEFAULT_AJNA_SECURITY_SENSITIVE_POLICY,
): readonly AjnaReviewFinding[] {
  const matchesByTier = new Map<AjnaSecuritySensitiveTier, MatchedFile[]>()

  for (const file of changedFiles) {
    for (const rule of policy.rules) {
      if (!rule.pattern.test(file)) continue
      const bucket = matchesByTier.get(rule.tier) ?? []
      bucket.push({ file, label: rule.label })
      matchesByTier.set(rule.tier, bucket)
      break
    }
  }

  const findings: AjnaReviewFinding[] = []
  for (const tier of ['secrets-and-crypto', 'auth-and-access-control', 'supply-chain'] as const) {
    const matches = matchesByTier.get(tier)
    if (matches === undefined || matches.length === 0) continue
    const affectedFiles = [...new Set(matches.map((match) => match.file))].sort()
    findings.push({
      id: `ajna-security-sensitive-${tier}`,
      category: 'SECURITY_SENSITIVE_CHANGE',
      risk: TIER_RISK[tier],
      title: TIER_TITLE[tier],
      summary: `${affectedFiles.length} file(s) matched security-sensitive patterns (${[...new Set(matches.map((match) => match.label))].join(', ')}).`,
      evidence: matches.map((match) => ({
        evidenceClass: 'DIRECT_DIFF_EVIDENCE',
        summary: `${match.file} matched: ${match.label}`,
        sourcePath: match.file,
      })),
      affectedFiles,
      recommendation: TIER_RECOMMENDATION[tier],
      blocksMerge: TIER_BLOCKS_MERGE[tier],
    })
  }
  return findings
}
