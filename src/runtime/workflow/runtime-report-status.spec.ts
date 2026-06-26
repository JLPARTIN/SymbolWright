import { describe, expect, it } from 'vitest'

import { reduceStatuses, statusFromReadiness } from './runtime-report-status.js'

describe('statusFromReadiness', () => {
  it('maps READY to READY', () => {
    expect(statusFromReadiness('READY')).toBe('READY')
  })

  it('maps READY_FOR_OPERATOR_REVIEW to READY', () => {
    expect(statusFromReadiness('READY_FOR_OPERATOR_REVIEW')).toBe('READY')
  })

  it('maps BLOCKED to BLOCKED', () => {
    expect(statusFromReadiness('BLOCKED')).toBe('BLOCKED')
  })

  it('maps NEEDS_RECOVERY_DETAIL to NEEDS_REVIEW', () => {
    expect(statusFromReadiness('NEEDS_RECOVERY_DETAIL')).toBe('NEEDS_REVIEW')
  })

  it('maps unknown readiness to NEEDS_REVIEW', () => {
    expect(statusFromReadiness('UNKNOWN_STATE')).toBe('NEEDS_REVIEW')
  })

  it('maps empty string to NEEDS_REVIEW', () => {
    expect(statusFromReadiness('')).toBe('NEEDS_REVIEW')
  })
})

describe('reduceStatuses', () => {
  it('returns READY for empty array', () => {
    expect(reduceStatuses([])).toBe('READY')
  })

  it('returns READY when all are READY', () => {
    expect(reduceStatuses(['READY', 'READY', 'READY'])).toBe('READY')
  })

  it('returns BLOCKED when any is BLOCKED', () => {
    expect(reduceStatuses(['READY', 'BLOCKED', 'READY'])).toBe('BLOCKED')
  })

  it('returns NEEDS_REVIEW when any is NEEDS_REVIEW and none BLOCKED', () => {
    expect(reduceStatuses(['READY', 'NEEDS_REVIEW', 'READY'])).toBe('NEEDS_REVIEW')
  })

  it('BLOCKED dominates NEEDS_REVIEW', () => {
    expect(reduceStatuses(['NEEDS_REVIEW', 'BLOCKED'])).toBe('BLOCKED')
  })

  it('BLOCKED dominates all other statuses', () => {
    expect(reduceStatuses(['READY', 'NEEDS_REVIEW', 'BLOCKED'])).toBe('BLOCKED')
  })

  it('NEEDS_REVIEW dominates READY but not BLOCKED', () => {
    expect(reduceStatuses(['READY', 'NEEDS_REVIEW'])).toBe('NEEDS_REVIEW')
  })

  it('returns READY for single READY', () => {
    expect(reduceStatuses(['READY'])).toBe('READY')
  })

  it('returns BLOCKED for single BLOCKED', () => {
    expect(reduceStatuses(['BLOCKED'])).toBe('BLOCKED')
  })

  it('returns NEEDS_REVIEW for single NEEDS_REVIEW', () => {
    expect(reduceStatuses(['NEEDS_REVIEW'])).toBe('NEEDS_REVIEW')
  })

  it('handles multiple BLOCKED entries', () => {
    expect(reduceStatuses(['BLOCKED', 'BLOCKED', 'READY'])).toBe('BLOCKED')
  })

  it('handles multiple NEEDS_REVIEW entries', () => {
    expect(reduceStatuses(['NEEDS_REVIEW', 'NEEDS_REVIEW', 'READY'])).toBe('NEEDS_REVIEW')
  })
})
