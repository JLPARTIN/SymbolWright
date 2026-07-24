import { readFile, writeFile } from 'node:fs/promises'

const targets = [
  'dist/app/views/agent-view.js',
  'dist/app/views/repository-view.js',
]

let replacements = 0

for (const target of targets) {
  let source
  try {
    source = await readFile(target, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') continue
    throw error
  }

  const patched = source.replaceAll(".join('\\n')", ".join('\\\\n')")
  if (patched !== source) {
    replacements += 1
    await writeFile(target, patched, 'utf8')
  }
}

if (replacements === 0) {
  console.log('Generated client newline escaping already valid.')
} else {
  console.log(`Patched generated client newline escaping in ${replacements} file(s).`)
}
