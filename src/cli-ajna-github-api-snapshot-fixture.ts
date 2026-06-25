import { readFileSync } from 'fs'

import {
  buildAjnaGithubCollectorSnapshotFromApiPayload,
  type AjnaGithubApiCollectorPayload,
} from './ajna/ajna-github-api-payload-adapter.js'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAjnaGithubApiSnapshotFixture(jsonText: string): AjnaGithubApiCollectorPayload {
  const parsed = JSON.parse(jsonText) as unknown
  if (!isObject(parsed)) {
    throw new Error('Ajna GitHub API snapshot fixture must be an object.')
  }
  return parsed as unknown as AjnaGithubApiCollectorPayload
}

export function renderAjnaGithubApiSnapshotFixtureForFile(inputPath: string): string {
  const apiPayload = parseAjnaGithubApiSnapshotFixture(readFileSync(inputPath, 'utf-8'))
  const snapshot = buildAjnaGithubCollectorSnapshotFromApiPayload(apiPayload)
  return JSON.stringify(snapshot, null, 2)
}
