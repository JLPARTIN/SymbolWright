import { describe, expect, it } from 'vitest'

import {
  getAjnaClientPipelineManifest,
  renderAjnaClientPipelineManifest,
} from './cli-ajna-client-pipeline-manifest.js'

describe('getAjnaClientPipelineManifest', () => {
  it('lists the client collector fixture pipeline in order', () => {
    const manifest = getAjnaClientPipelineManifest()

    expect(manifest.mode).toBe('READ_ONLY')
    expect(manifest.steps.map((step) => step.name)).toEqual([
      'Snapshot fixture',
      'Review fixture',
      'Readiness fixture',
    ])
  })

  it('keeps every step on the local fixture command path', () => {
    const manifest = getAjnaClientPipelineManifest()

    expect(manifest.steps.map((step) => step.cli)).toEqual([
      'symbolwright ajna client-collector-fixture <json-file>',
      'symbolwright ajna review-pr-client-collector-fixture <json-file>',
      'symbolwright ajna merge-readiness-client-collector-fixture <json-file>',
    ])
  })
})

describe('renderAjnaClientPipelineManifest', () => {
  it('renders the manifest as operator-readable text', () => {
    const output = renderAjnaClientPipelineManifest()

    expect(output).toContain('Ajna client collector fixture pipeline')
    expect(output).toContain('Mode: READ_ONLY')
    expect(output).toContain('collector snapshot JSON')
    expect(output).toContain('Ajna review report')
    expect(output).toContain('Ajna merge-readiness report')
  })
})
