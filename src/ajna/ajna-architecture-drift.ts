import type { AjnaReviewFinding } from './ajna-review.types.js'

/**
 * AJNA-8: architecture drift detector.
 *
 * Two independent signals, both driven entirely by evidence the caller
 * supplies (changed file paths and, optionally, import edges extracted from
 * the diff) — Ajna does not read files or parse source itself here:
 *
 * 1. Layering violations: an import edge that crosses a directional
 *    boundary the caller's policy declares closed. This requires a
 *    repository-specific policy because "layering" is a project convention,
 *    not something a generic path pattern can infer.
 * 2. Change breadth: a single review touching an unusually large number of
 *    distinct top-level `src/` modules. This needs no policy and applies to
 *    any repository using a `src/<module>/...` layout.
 */

export interface AjnaImportEdge {
  readonly importer: string
  readonly imported: string
}

export interface AjnaLayeringRule {
  readonly from: string
  readonly mustNotImport: readonly string[]
}

export interface AjnaArchitecturePolicy {
  readonly layering?: readonly AjnaLayeringRule[]
  readonly maxTouchedModulesBeforeDrift?: number
}

export interface AjnaArchitectureDriftInput {
  readonly changedFiles: readonly string[]
  readonly importEdges?: readonly AjnaImportEdge[]
  readonly policy?: AjnaArchitecturePolicy
}

const DEFAULT_MAX_TOUCHED_MODULES = 5

function topLevelModule(filePath: string): string | undefined {
  const match = /^src\/([^/]+)\//.exec(filePath.replaceAll('\\', '/'))
  return match?.[1]
}

function layeringViolations(
  importEdges: readonly AjnaImportEdge[],
  layering: readonly AjnaLayeringRule[],
): AjnaReviewFinding | undefined {
  const violations: { readonly edge: AjnaImportEdge; readonly rule: AjnaLayeringRule }[] = []

  for (const edge of importEdges) {
    const importerModule = topLevelModule(edge.importer)
    const importedModule = topLevelModule(edge.imported)
    if (importerModule === undefined || importedModule === undefined) continue
    const rule = layering.find((entry) => entry.from === importerModule)
    if (rule !== undefined && rule.mustNotImport.includes(importedModule)) {
      violations.push({ edge, rule })
    }
  }

  if (violations.length === 0) return undefined

  const affectedFiles = [...new Set(violations.map((violation) => violation.edge.importer))].sort()
  return {
    id: 'ajna-architecture-drift-layering',
    category: 'ARCHITECTURE_DRIFT',
    risk: 'HIGH',
    title: 'Layering boundary violated',
    summary: `${violations.length} import(s) cross a declared architecture boundary.`,
    evidence: violations.map((violation) => ({
      evidenceClass: 'DIRECT_DIFF_EVIDENCE',
      summary: `${violation.edge.importer} imports ${violation.edge.imported}, but '${violation.rule.from}' must not import '${topLevelModule(violation.edge.imported)}'.`,
      sourcePath: violation.edge.importer,
    })),
    affectedFiles,
    recommendation:
      'Remove the boundary-crossing import or update the architecture policy if the boundary has intentionally changed.',
    blocksMerge: true,
  }
}

function changeBreadthFinding(
  changedFiles: readonly string[],
  maxTouchedModules: number,
): AjnaReviewFinding | undefined {
  const modules = [
    ...new Set(changedFiles.map(topLevelModule).filter((value) => value !== undefined)),
  ].sort()
  if (modules.length <= maxTouchedModules) return undefined

  return {
    id: 'ajna-architecture-drift-breadth',
    category: 'ARCHITECTURE_DRIFT',
    risk: 'MEDIUM',
    title: 'Wide cross-module change',
    summary: `This change touches ${modules.length} distinct top-level modules (${modules.join(', ')}), more than the configured threshold of ${maxTouchedModules}.`,
    evidence: [
      {
        evidenceClass: 'INFERRED_RISK',
        summary: `Changed files span modules: ${modules.join(', ')}.`,
      },
    ],
    affectedFiles: [...changedFiles].sort(),
    recommendation:
      'Confirm this change is intentionally cross-cutting; consider splitting unrelated module changes into separate reviews.',
    blocksMerge: false,
  }
}

/**
 * Detects architecture drift from changed file paths and, when supplied,
 * import edges extracted from the diff. Layering checks only run when the
 * caller provides a policy — Ajna has no way to infer a repository's
 * intended module boundaries on its own. The change-breadth check requires
 * no policy and always runs.
 */
export function detectAjnaArchitectureDrift(
  input: AjnaArchitectureDriftInput,
): readonly AjnaReviewFinding[] {
  const findings: AjnaReviewFinding[] = []
  const layering = input.policy?.layering
  if (layering !== undefined && layering.length > 0 && input.importEdges !== undefined) {
    const finding = layeringViolations(input.importEdges, layering)
    if (finding !== undefined) findings.push(finding)
  }

  const breadthFinding = changeBreadthFinding(
    input.changedFiles,
    input.policy?.maxTouchedModulesBeforeDrift ?? DEFAULT_MAX_TOUCHED_MODULES,
  )
  if (breadthFinding !== undefined) findings.push(breadthFinding)

  return findings
}
