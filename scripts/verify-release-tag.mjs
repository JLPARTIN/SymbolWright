import fs from 'node:fs'
import { extractReleaseNotes } from './lib/changelog-release.mjs'

const raw = process.argv[2] ?? process.env.GITHUB_REF_NAME
if (!raw) throw new Error('A release tag is required.')
const version = raw.startsWith('v') ? raw.slice(1) : raw
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
if (pkg.version !== version)
  throw new Error(`Tag ${raw} does not match package.json ${pkg.version}.`)
if (lock.version !== version || lock.packages?.['']?.version !== version) {
  throw new Error(`Tag ${raw} does not match package-lock.json.`)
}
extractReleaseNotes(fs.readFileSync('CHANGELOG.md', 'utf8'), version)
console.log(`Release tag ${raw} matches package, lockfile, and changelog.`)
