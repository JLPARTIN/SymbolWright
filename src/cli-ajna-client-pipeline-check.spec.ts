import { describe, expect, it } from 'vitest'

import type { AjnaClientPipelineManifest } from './cli-ajna-client-pipeline-manifest.js'
import {
  buildAjnaClientPipelineCheckResult,
  findAjnaClientPipelineManifestIssues,
  renderAjnaClientPipelineCheck,
} from './cli-ajna-client-pipeline-check.js'

function makeCanonicalManifest(): AjnaClientPipelineManifest {
  return {
    title: 'Ajna client collector fixture pipeline',
    mode: 'READ_ONLY',
    steps: [
      {
        order: 1,
        name: 'Snapshot fixture',
        cli: 'codemind ajna client-collector-fixture <json-file>',
        result: 'collector snapshot JSON',
      },
      {
        order: 2,
        name: 'Review fixture',
        cli: 'codemind ajna review-pr-client-collector-fixture <json-file>',
        result: 'Ajna review report',
      },
      {
        order: 3,
        name: 'Readiness fixture',
        cli: 'codemind ajna merge-readiness-client-collector-fixture <json-file>',
        result: 'Ajna merge-readiness report',
      },
    ],
  }
}

function makeChangedManifest(): AjnaClientPipelineManifest {
  return {
    ...makeCanonicalManifest(),
    steps: [
      makeCanonicalManifest().steps[0],
      {
        order: 2,
        name: 'Review fixture',
        cli: 'codemind ajna review-pr <json-file>',
        result: 'Ajna review report',
      },
      makeCanonicalManifest().steps[2],
    ],
  }
}

describe('findAjnaClientPipelineManifestIssues', () => {
  it('passes the canonical manifest', () => {
    expect(findAjnaClientPipelineManifestIssues()).toEqual([])
  })

  it('detects a changed command in the expected local fixture chain', () => {
    expect(findAjnaClientPipelineManifestIssues(makeChangedManifest())).toEqual([
      'step 2 command changed from codemind ajna review-pr-client-collector-fixture <json-file> to codemind ajna review-pr <json-file>',
    ])
  })

  it('detects a missing pipeline step', () => {
    const manifest: AjnaClientPipelineManifest = {
      ...makeCanonicalManifest(),
      steps: makeCanonicalManifest().steps.slice(0, 2),
    }

    expect(findAjnaClientPipelineManifestIssues(manifest)).toEqual([
      'step count changed from 3 to 2',
      'missing step 3: Readiness fixture',
    ])
  })
})

describe('buildAjnaClientPipelineCheckResult', () => {
  it('returns PASS for the canonical manifest', () => {
    expect(buildAjnaClientPipelineCheckResult()).toEqual({
      status: 'PASS',
      checkedSteps: 3,
      issues: [],
    })
  })

  it('returns FAIL when the manifest changes', () => {
    expect(buildAjnaClientPipelineCheckResult(makeChangedManifest()).status).toBe('FAIL')
  })
})

describe('renderAjnaClientPipelineCheck', () => {
  it('renders a clean PASS report', () => {
    const output = renderAjnaClientPipelineCheck()

    expect(output).toContain('Ajna client pipeline check')
    expect(output).toContain('Status: PASS')
    expect(output).toContain('Issues: None')
    expect(output).toContain('Mode: READ_ONLY')
  })
})
