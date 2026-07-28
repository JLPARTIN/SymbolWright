import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import {
  prepareChangelogRelease,
  extractReleaseNotes,
  assertReleaseVersion,
} from './lib/changelog-release.mjs'

const version = process.argv[2]
assertReleaseVersion(version)
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
if (status.status !== 0 || status.stdout.trim().length > 0)
  throw new Error('release:prepare requires a clean working tree.')
const paths = ['CHANGELOG.md', 'package.json', 'package-lock.json']
const backups = Object.fromEntries(paths.map((path) => [path, fs.readFileSync(path)]))
try {
  const date = new Date().toISOString().slice(0, 10)
  fs.writeFileSync(
    'CHANGELOG.md',
    prepareChangelogRelease(backups['CHANGELOG.md'].toString('utf8'), version, date),
  )
  const bump = spawnSync('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts'], {
    stdio: 'inherit',
  })
  if (bump.status !== 0) throw new Error('npm version failed.')
  extractReleaseNotes(fs.readFileSync('CHANGELOG.md', 'utf8'), version)
  const validate = spawnSync('npm', ['run', 'validate'], { stdio: 'inherit', env: process.env })
  if (validate.status !== 0) throw new Error('Release validation failed.')
  console.log(
    `Prepared ${version}. Review and commit the deliberate package/lock/changelog diff before tagging.`,
  )
} catch (error) {
  for (const [path, content] of Object.entries(backups)) fs.writeFileSync(path, content)
  throw error
}
