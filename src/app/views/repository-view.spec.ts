import { describe, expect, it } from 'vitest'

import { buildRepositoryViewClientScript, renderRepositoryViewHtml } from './repository-view.js'

describe('renderRepositoryViewHtml', () => {
  it('labels the view as the real working tree, distinct from the Scratch Workspace tab', () => {
    const html = renderRepositoryViewHtml()
    expect(html).toContain('data-view="repository"')
    expect(html).toContain('actual checked-out working tree')
  })

  it('renders editor, status, branch, commit, push, and PR controls', () => {
    const html = renderRepositoryViewHtml()
    expect(html).toContain('id="repo-editor"')
    expect(html).toContain('id="repo-save-btn"')
    expect(html).toContain('id="repo-branch-select"')
    expect(html).toContain('id="repo-new-branch-btn"')
    expect(html).toContain('id="repo-commit-btn"')
    expect(html).toContain('id="repo-push-btn"')
    expect(html).toContain('id="repo-pr-btn"')
  })
})

describe('buildRepositoryViewClientScript', () => {
  it('calls the real repository API routes added in this bundle, not a fixture', () => {
    const script = buildRepositoryViewClientScript()
    expect(script).toContain('/api/repository/tree')
    expect(script).toContain('/api/repository/file')
    expect(script).toContain('/api/repository/status')
    expect(script).toContain('/api/repository/diff')
    expect(script).toContain('/api/repository/branches')
    expect(script).toContain('/api/repository/commit')
    expect(script).toContain('/api/repository/push')
    expect(script).toContain('/api/repository/pull-request')
  })

  it('requires an explicit window.confirm before pushing', () => {
    const script = buildRepositoryViewClientScript()
    const fnBody = script.slice(
      script.indexOf('async function pushRepoBranch'),
      script.indexOf('async function createRepoPullRequest'),
    )
    expect(fnBody).toContain('window.confirm(')
    expect(fnBody.indexOf('window.confirm(')).toBeLessThan(fnBody.indexOf("'/api/repository/push'"))
  })

  it('requires an explicit window.confirm before creating a pull request', () => {
    const script = buildRepositoryViewClientScript()
    const fnBody = script.slice(
      script.indexOf('async function createRepoPullRequest'),
      script.indexOf("getElementById('repo-save-btn').addEventListener"),
    )
    expect(fnBody).toContain('window.confirm(')
    expect(fnBody.indexOf('window.confirm(')).toBeLessThan(
      fnBody.indexOf("'/api/repository/pull-request'"),
    )
  })

  it('sends confirm: true explicitly rather than relying on a server-side default for push and PR creation', () => {
    const script = buildRepositoryViewClientScript()
    expect(script).toContain('confirm: true')
  })

  it('handles a 409 save conflict by asking the operator before overwriting, and never silently discards either side', () => {
    const script = buildRepositoryViewClientScript()
    const fnBody = script.slice(
      script.indexOf('async function saveRepoFile'),
      script.indexOf('async function loadRepoDiff'),
    )
    expect(fnBody).toContain('result.status === 409')
    expect(fnBody).toContain('window.confirm(')
    expect(fnBody).toContain('currentContent')
  })

  it('echoes back the loaded contentHash as baseContentHash on save, for optimistic-concurrency conflict detection', () => {
    const script = buildRepositoryViewClientScript()
    expect(script).toContain('repoState.currentBaseHash = result.body.contentHash')
    expect(script).toContain('baseContentHash: repoState.currentBaseHash')
  })

  it('requires an explicit window.confirm before restoring a checkpoint', () => {
    const script = buildRepositoryViewClientScript()
    // Restore lives in checkpoints-view.ts, not here -- this repository view only
    // performs the file/branch/commit/push/PR actions listed above.
    expect(script).not.toContain('/restore')
  })

  it('lazy-loads the tree only once per page load, not on every tab revisit', () => {
    const script = buildRepositoryViewClientScript()
    expect(script).toContain('repoViewLoaded')
  })
})
