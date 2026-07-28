import { access, readFile, writeFile } from 'node:fs/promises'

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function flexibleMultilinePattern(text) {
  const lines = text.split('\n')
  const pattern = lines
    .map((line) => `[ \\t]*${escapeRegex(line.trimStart())}`)
    .join('\\n')
  return new RegExp(pattern, 'g')
}

async function replaceOnce(file, oldText, newText) {
  const content = await readFile(file, 'utf8')
  const first = content.indexOf(oldText)
  if (first >= 0) {
    if (content.indexOf(oldText, first + oldText.length) >= 0) {
      throw new Error(`Replacement anchor is not unique in ${file}: ${oldText.slice(0, 120)}`)
    }
    await writeFile(file, content.slice(0, first) + newText + content.slice(first + oldText.length), 'utf8')
    return
  }

  // Builder source blocks are generated with common indentation removed. When an exact match
  // misses, allow only leading horizontal whitespace to differ on each line; all tokens and line
  // ordering must still match exactly, and the match must remain unique.
  const pattern = flexibleMultilinePattern(oldText)
  const matches = [...content.matchAll(pattern)]
  if (matches.length !== 1 || matches[0]?.index === undefined) {
    throw new Error(`Missing or non-unique flexible replacement anchor in ${file}: ${oldText.slice(0, 120)}`)
  }
  const match = matches[0]
  const at = match.index
  await writeFile(file, content.slice(0, at) + newText + content.slice(at + match[0].length), 'utf8')
}

async function insertAfter(file, anchor, text) {
  const content = await readFile(file, 'utf8')
  const first = content.indexOf(anchor)
  if (first < 0) throw new Error(`Missing insert anchor in ${file}: ${anchor.slice(0, 120)}`)
  if (content.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`Insert anchor is not unique in ${file}: ${anchor.slice(0, 120)}`)
  }
  const at = first + anchor.length
  await writeFile(file, content.slice(0, at) + text + content.slice(at), 'utf8')
}

async function replaceBetween(file, startMarker, endMarker, replacement) {
  const content = await readFile(file, 'utf8')
  const start = content.indexOf(startMarker)
  if (start < 0) throw new Error(`Missing range start in ${file}: ${startMarker.slice(0, 120)}`)
  const end = content.indexOf(endMarker, start + startMarker.length)
  if (end < 0) throw new Error(`Missing range end in ${file}: ${endMarker.slice(0, 120)}`)
  if (content.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`Range start is not unique in ${file}: ${startMarker.slice(0, 120)}`)
  }
  const afterEnd = end + endMarker.length
  await writeFile(file, content.slice(0, start) + replacement + content.slice(afterEnd), 'utf8')
}

async function createFile(file, content) {
  try {
    await access(file)
    throw new Error(`Refusing to overwrite existing file: ${file}`)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      await writeFile(file, content, 'utf8')
      return
    }
    throw error
  }
}

export async function applyOperations(operations) {
  for (const operation of operations) {
    switch (operation.type) {
      case 'replace':
        await replaceOnce(operation.file, operation.old, operation.new)
        break
      case 'after':
        await insertAfter(operation.file, operation.anchor, operation.text)
        break
      case 'between':
        await replaceBetween(operation.file, operation.start, operation.end, operation.new)
        break
      case 'create':
        await createFile(operation.file, operation.content)
        break
      default:
        throw new Error(`Unknown operation type: ${operation.type}`)
    }
  }
}
