const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export function assertReleaseVersion(version) {
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error(`Release version must be valid SemVer without a leading v: ${String(version)}`)
  }
}

export function extractUnreleasedBody(content) {
  const match = content.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|$)/)
  if (!match) throw new Error('CHANGELOG.md is missing ## [Unreleased].')
  return match[1].trim()
}

export function prepareChangelogRelease(content, version, date) {
  assertReleaseVersion(version)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Release date is invalid: ${date}`)
  if (content.includes(`## [${version}]`))
    throw new Error(`CHANGELOG.md already contains ${version}.`)
  const body = extractUnreleasedBody(content)
  if (body.length === 0) throw new Error('The Unreleased changelog section is empty.')
  const replacement = `## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n`
  return content.replace(/## \[Unreleased\]\s*\n[\s\S]*?(?=\n## \[|$)/, replacement.trimEnd())
}

export function extractReleaseNotes(content, version) {
  assertReleaseVersion(version)
  const heading = `## [${version}]`
  const headingIndex = content.indexOf(heading)
  if (headingIndex < 0) throw new Error(`No release notes found for ${version}.`)
  const bodyStart = content.indexOf('\n', headingIndex)
  if (bodyStart < 0) throw new Error(`No release notes found for ${version}.`)
  const nextHeading = content.indexOf('\n## [', bodyStart + 1)
  const body = content.slice(bodyStart + 1, nextHeading < 0 ? content.length : nextHeading).trim()
  if (body.length === 0) throw new Error(`No release notes found for ${version}.`)
  return body + '\n'
}
