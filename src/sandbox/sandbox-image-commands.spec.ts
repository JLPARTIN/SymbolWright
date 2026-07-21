import { describe, expect, it } from 'vitest'

import {
  renderSandboxImageInspectCommand,
  renderSandboxImagePrepareCommand,
} from './sandbox-image-commands.js'
import { runnerAvailability } from './sandbox-registry.js'
import type { SandboxImageDefinition } from './sandbox-types.js'
import type { SandboxContainerEngineStatus } from './sandbox-images.js'

const CHECKED_AT = '2026-07-20T00:00:00.000Z'
const DOCKER_OPTIONS = {
  discoverCommandAvailability: async () =>
    new Map([
      [
        'docker',
        runnerAvailability('available', CHECKED_AT, {
          version: '27.0.0',
        }),
      ],
    ]),
  inspectLocalImage: async (
    image: SandboxImageDefinition,
    engine: SandboxContainerEngineStatus,
  ) => ({
    imageId: image.id,
    image: image.image,
    engine: engine.engine,
    status: 'installed' as const,
    inspectedAt: CHECKED_AT,
    reason: 'allowlisted image was found in the local image store.',
    sizeBytes: 123_456,
    digest: 'python@sha256:local-digest',
  }),
}

describe('sandbox image command contracts', () => {
  it('inspects only built-in allowlisted image IDs', async () => {
    const rendered = await renderSandboxImageInspectCommand(
      ['python-3-12-slim'],
      DOCKER_OPTIONS,
    )

    expect(rendered).toContain('CodeMind Sandbox Image Inspection')
    expect(rendered).toContain('Image ID: python-3-12-slim')
    expect(rendered).toContain('Image: python:3.12-slim')
    expect(rendered).toContain('Container engine: docker (available)')
    expect(rendered).toContain('Local store status: installed')
    expect(rendered).toContain('Local image size bytes: 123456')
    expect(rendered).toContain('Local image digest: python@sha256:local-digest')
    expect(rendered).toContain('This command is read-only')
  })

  it('rejects missing and arbitrary image names', async () => {
    const missing = await renderSandboxImageInspectCommand([], DOCKER_OPTIONS)
    const arbitrary = await renderSandboxImageInspectCommand(
      ['registry.example/bad:latest'],
      DOCKER_OPTIONS,
    )

    expect(missing).toContain('Missing sandbox image id')
    expect(missing).toContain('Allowed image IDs')
    expect(arbitrary).toContain('Unknown sandbox image id')
    expect(arbitrary).toContain('arbitrary container image names')
  })

  it('renders a review-only preparation plan when an engine is detected', async () => {
    const rendered = await renderSandboxImagePrepareCommand(
      ['golang-1-23-bookworm'],
      DOCKER_OPTIONS,
    )

    expect(rendered).toContain('CodeMind Sandbox Image Preparation Plan')
    expect(rendered).toContain('Status: REVIEW_REQUIRED')
    expect(rendered).toContain('prepare this allowlisted image manually')
    expect(rendered).toContain(
      'CodeMind does not execute this plan automatically',
    )
  })

  it('blocks preparation when no container engine is detected', async () => {
    const rendered = await renderSandboxImagePrepareCommand(
      ['rust-1-bookworm'],
      {
        discoverCommandAvailability: async () => new Map(),
      },
    )

    expect(rendered).toContain('Status: BLOCKED')
    expect(rendered).toContain('No usable container engine is enabled')
  })
})
