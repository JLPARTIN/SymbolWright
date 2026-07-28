import fs from 'node:fs'
import { extractReleaseNotes } from './lib/changelog-release.mjs'

const version = process.argv[2] ?? JSON.parse(fs.readFileSync('package.json', 'utf8')).version
process.stdout.write(extractReleaseNotes(fs.readFileSync('CHANGELOG.md', 'utf8'), version))
