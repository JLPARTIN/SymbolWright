const args = process.argv.slice(2)
const imageIndex = args.indexOf('--image')
const image = imageIndex >= 0 ? args[imageIndex + 1] : undefined
const { runDockerSmoke } = await import('../dist/release/artifact-smoke.js')
const result = runDockerSmoke(process.cwd(), image)
console.log(`[${result.status}] ${result.detail}`)
if (result.status === 'FAIL') process.exitCode = 1
