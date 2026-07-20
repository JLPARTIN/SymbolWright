import { randomUUID } from 'node:crypto'

const MISSION_ID_PATTERN = /^mission_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function generateMissionId(): string {
  return `mission_${randomUUID()}`
}

export function isValidMissionId(value: string): boolean {
  return MISSION_ID_PATTERN.test(value)
}

export function assertValidMissionId(value: string): void {
  if (!isValidMissionId(value)) {
    throw new Error(`Invalid mission id: ${value}`)
  }
}
