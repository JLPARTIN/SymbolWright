export interface AjnaPlanCritique {
  readonly verdict: 'READY' | 'NEEDS_WORK'
  readonly findings: readonly string[]
}

export function critiquePlanText(planText: string): AjnaPlanCritique {
  const findings: string[] = []

  if (!planText.includes('Boundary:')) {
    findings.push('Plan should include an explicit boundary section.')
  }

  if (!planText.toLowerCase().includes('validation')) {
    findings.push('Plan should mention validation before execution.')
  }

  return {
    verdict: findings.length === 0 ? 'READY' : 'NEEDS_WORK',
    findings,
  }
}
