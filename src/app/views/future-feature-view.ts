export interface FuturePlaceholderViewOptions {
  readonly routeId: string
  readonly title: string
  readonly plannedBundleLabel: string
  readonly description: string
}

/**
 * Renders an honest "not built yet" placeholder for a nav destination whose
 * backend doesn't exist in this bundle — e.g. the real repository workflow
 * (clone, branches, diffs, commit, push, PR) that Large PR Bundle 2 adds.
 * Per the audit's own rule, this must not render clickable controls that
 * imply working functionality; it states plainly what's planned and where
 * to find the equivalent capability today, if any.
 */
export function renderFuturePlaceholderViewHtml(options: FuturePlaceholderViewOptions): string {
  return `<section data-view="${options.routeId}" class="app-view" style="display:none">
    <h2>${options.title}</h2>
    <p class="planned-badge">Planned — ${options.plannedBundleLabel}</p>
    <p>${options.description}</p>
  </section>`
}

export function renderRepositoryPlaceholderViewHtml(): string {
  return renderFuturePlaceholderViewHtml({
    routeId: 'repository',
    title: 'Repository workflow',
    plannedBundleLabel: 'Large PR Bundle 2',
    description:
      'Opening the checked-out repository tree, tracking Git status, viewing diffs, restoring checkpoints ' +
      'into the working tree, branching, committing, pushing, and opening a PR from inside this app is not ' +
      'built yet. Today, use the CLI (codemind agent with a mode of APPROVED_EXECUTION, or the checkpoint/git ' +
      'tools directly) for repository-mutating work.',
  })
}
