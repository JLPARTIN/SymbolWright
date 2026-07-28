import assert from 'node:assert/strict'
import test from 'node:test'
import { extractReleaseNotes, prepareChangelogRelease } from './changelog-release.mjs'

test('promotes Unreleased into a dated release and leaves a fresh empty Unreleased section', () => {
  const result = prepareChangelogRelease(
    '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- One.\n\n## [0.1.0] - 2026-01-01\n\nOld.\n',
    '0.2.0',
    '2026-07-27',
  )
  assert.match(result, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-07-27/)
  assert.equal(extractReleaseNotes(result, '0.2.0'), '### Fixed\n\n- One.\n')
})

test('refuses an empty Unreleased section', () => {
  assert.throws(
    () => prepareChangelogRelease('# Changelog\n\n## [Unreleased]\n', '1.0.0', '2026-07-27'),
    /empty/,
  )
})
