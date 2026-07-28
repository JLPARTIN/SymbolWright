import { randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface ArtifactSmokeResult {
  readonly status: 'PASS' | 'SKIP' | 'FAIL'
  readonly detail: string
}

function commandExists(command: string): boolean {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
}

function run(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  return execFileSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function runNpmPackSmoke(workspaceRoot: string): ArtifactSmokeResult {
  const root = mkdtempSync(path.join(tmpdir(), 'symbolwright-pack-smoke-'))
  try {
    const packDir = path.join(root, 'pack')
    const projectDir = path.join(root, 'project')
    mkdirSync(packDir)
    mkdirSync(projectDir)
    writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ private: true }))
    const packed = JSON.parse(
      run('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: workspaceRoot }),
    ) as { filename: string }[]
    const tarball = path.join(packDir, packed[0]?.filename ?? '')
    run('npm', ['install', '--ignore-scripts', tarball], { cwd: projectDir })
    const binInvocations = [
      ['symbolwright', ['--help']],
      ['symbolwright-workspace', ['--json']],
      ['codemind', ['--help']],
      ['codemind-workspace', ['--json']],
    ] as const
    for (const [bin, args] of binInvocations) {
      run(path.join(projectDir, 'node_modules', '.bin', bin), args, { cwd: projectDir })
    }
    return {
      status: 'PASS',
      detail:
        'Packed tarball installed in a fresh project and all canonical/compatibility bins executed.',
    }
  } catch (error) {
    return { status: 'FAIL', detail: error instanceof Error ? error.message : String(error) }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function availablePort(): number {
  const script =
    "const n=require('node:net');const s=n.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
  return Number(run(process.execPath, ['-e', script]))
}

function curl(url: string, apiKey?: string): void {
  const args = ['--fail', '--silent', '--show-error', '--max-time', '2', '--insecure']
  if (apiKey !== undefined) args.push('-H', `Authorization: Bearer ${apiKey}`)
  args.push(url)
  run('curl', args)
}

function waitFor(url: string, apiKey?: string): void {
  const deadline = Date.now() + 30_000
  let last: unknown
  while (Date.now() < deadline) {
    try {
      curl(url, apiKey)
      return
    } catch (error) {
      last = error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
    }
  }
  throw last instanceof Error ? last : new Error(`Timed out waiting for ${url}`)
}

function smokeProfile(image: string, profile: 'local' | 'hosted'): void {
  const name = `symbolwright-smoke-${profile}-${randomUUID()}`
  const volume = `${name}-state`
  const certs = mkdtempSync(path.join(tmpdir(), `symbolwright-${profile}-certs-`))
  const port = availablePort()
  const key = 'release-smoke-key'
  try {
    const env = [
      '-e',
      `SYMBOLWRIGHT_API_KEY=${key}`,
      '-e',
      'SYMBOLWRIGHT_CHAT_HOST=0.0.0.0',
      '-e',
      'SYMBOLWRIGHT_CHAT_PORT=8787',
    ]
    run('docker', ['volume', 'create', volume])
    const mounts = ['-v', `${volume}:/data`]
    let scheme = 'http'
    if (profile === 'local') {
      env.push(
        '-e',
        'SYMBOLWRIGHT_DEPLOYMENT_MODE=local',
        '-e',
        'SYMBOLWRIGHT_ALLOW_UNENCRYPTED_NON_LOOPBACK=true',
      )
    } else {
      if (spawnSync('openssl', ['version'], { stdio: 'ignore' }).status !== 0)
        throw new Error('openssl is required for hosted Docker smoke.')
      run('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=localhost',
        '-keyout',
        path.join(certs, 'key.pem'),
        '-out',
        path.join(certs, 'cert.pem'),
        '-days',
        '1',
      ])
      run('chmod', ['0555', certs])
      run('chmod', ['0444', path.join(certs, 'key.pem'), path.join(certs, 'cert.pem')])
      mounts.push('-v', `${certs}:/certs:ro`)
      scheme = 'https'
      env.push(
        '-e',
        'SYMBOLWRIGHT_DEPLOYMENT_MODE=hosted',
        '-e',
        'SYMBOLWRIGHT_TLS_CERT_FILE=/certs/cert.pem',
        '-e',
        'SYMBOLWRIGHT_TLS_KEY_FILE=/certs/key.pem',
        '-e',
        'SYMBOLWRIGHT_MAX_PROVIDER_CONCURRENCY=2',
        '-e',
        'SYMBOLWRIGHT_MAX_SSE_STREAMS=2',
        '-e',
        'SYMBOLWRIGHT_MAX_AUTONOMOUS_EXECUTIONS=1',
      )
    }
    run('docker', [
      'run',
      '--detach',
      '--name',
      name,
      '-p',
      `127.0.0.1:${port}:8787`,
      ...mounts,
      ...env,
      image,
      'serve',
    ])
    waitFor(`${scheme}://127.0.0.1:${port}/api/health`)
    waitFor(`${scheme}://127.0.0.1:${port}/readyz`)
    waitFor(`${scheme}://127.0.0.1:${port}/api/metrics`, key)
    if (run('docker', ['exec', name, 'id', '-u']) === '0')
      throw new Error('Container runs as root.')
    run('docker', ['exec', name, 'sh', '-c', 'test -w /data && touch /data/.release-smoke'])
    run('docker', ['kill', '--signal=TERM', name])
    const deadline = Date.now() + 15_000
    while (
      Date.now() < deadline &&
      run('docker', ['inspect', '-f', '{{.State.Running}}', name]) === 'true'
    ) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
    }
    if (run('docker', ['inspect', '-f', '{{.State.Running}}', name]) === 'true')
      throw new Error('Container did not stop after SIGTERM.')
    if (run('docker', ['inspect', '-f', '{{.State.ExitCode}}', name]) !== '0')
      throw new Error('Container exited non-zero after SIGTERM.')
  } catch (error) {
    const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' })
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${detail}\nContainer logs:\n${logs.stdout ?? ''}${logs.stderr ?? ''}`)
  } finally {
    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
    spawnSync('docker', ['volume', 'rm', '-f', volume], { stdio: 'ignore' })
    spawnSync('chmod', ['0700', certs], { stdio: 'ignore' })
    rmSync(certs, { recursive: true, force: true })
  }
}

export function runDockerSmoke(workspaceRoot: string, imageOverride?: string): ArtifactSmokeResult {
  const required = process.env['SYMBOLWRIGHT_REQUIRE_DOCKER_SMOKE'] === '1'
  if (!commandExists('docker'))
    return required
      ? { status: 'FAIL', detail: 'Docker is required but unavailable.' }
      : { status: 'SKIP', detail: 'Docker unavailable; smoke skipped outside strict release CI.' }
  const image = imageOverride ?? `symbolwright-release-smoke:${randomUUID()}`
  try {
    if (imageOverride === undefined)
      run('docker', ['build', '--tag', image, '.'], { cwd: workspaceRoot })
    smokeProfile(image, 'local')
    smokeProfile(image, 'hosted')
    return {
      status: 'PASS',
      detail:
        'Local artifact and hosted TLS profiles passed health, readiness, auth, non-root, writable-state, and SIGTERM checks.',
    }
  } catch (error) {
    return { status: 'FAIL', detail: error instanceof Error ? error.message : String(error) }
  } finally {
    if (imageOverride === undefined)
      spawnSync('docker', ['image', 'rm', '-f', image], { stdio: 'ignore' })
  }
}
