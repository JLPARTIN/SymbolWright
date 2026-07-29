import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import type { DependencyAcquisitionLimits } from './dependency-policy.js'
import { inspectNpmTarball } from './npm-tarball-inspector.js'

const LIMITS: DependencyAcquisitionLimits = {
  maxPackages: 100,
  maxRequests: 100,
  maxArchiveBytes: 1_000_000,
  maxExpandedBytes: 1_000_000,
  maxFiles: 100,
  maxFileBytes: 100_000,
  maxTotalBytes: 500_000,
  timeoutMs: 60_000,
  maxConcurrency: 2,
}

interface TarEntryFixture {
  readonly name: string
  readonly type?: 'file' | 'directory' | 'symlink'
  readonly content?: string | Uint8Array
}

describe('npm tarball inspector', () => {
  it('accepts a bounded npm tarball without extracting it', () => {
    const archive = tarGzip([
      { name: 'package/', type: 'directory' },
      { name: 'package/package.json', content: '{"name":"fixture","version":"1.0.0"}' },
      { name: 'package/index.js', content: 'export const value = 1\n' },
    ])

    const report = inspectNpmTarball(archive, LIMITS)

    expect(report.fileCount).toBe(2)
    expect(report.expandedBytes).toBeGreaterThan(0)
    expect(report.entries).toEqual([
      { path: 'package/', type: 'directory', size: 0 },
      {
        path: 'package/package.json',
        type: 'file',
        size: Buffer.byteLength('{"name":"fixture","version":"1.0.0"}'),
      },
      {
        path: 'package/index.js',
        type: 'file',
        size: Buffer.byteLength('export const value = 1\n'),
      },
    ])
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.entries)).toBe(true)
  })

  it.each([
    '../escape',
    'package/../../escape',
    '/absolute/path',
    'C:/windows/path',
    'other-root/package.json',
  ])('rejects archive path escape %s', (name) => {
    const archive = tarGzip([
      { name: 'package/package.json', content: '{}' },
      { name, content: 'escape' },
    ])

    expect(() => inspectNpmTarball(archive, LIMITS)).toThrowError(
      expect.objectContaining({
        code: expect.stringMatching(/DEPENDENCY_ARCHIVE_(PATH_ESCAPE|ROOT_INVALID)/),
      }),
    )
  })

  it('rejects symbolic and hard-link-style package content', () => {
    const archive = tarGzip([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/link', type: 'symlink' },
    ])

    expect(() => inspectNpmTarball(archive, LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_ARCHIVE_LINK_FORBIDDEN' }),
    )
  })

  it('rejects file-count bombs', () => {
    const archive = tarGzip([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/a', content: 'a' },
      { name: 'package/b', content: 'b' },
    ])

    expect(() => inspectNpmTarball(archive, { ...LIMITS, maxFiles: 2 })).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_FILE_COUNT_QUOTA_EXCEEDED' }),
    )
  })

  it('rejects per-file and total-content expansion bombs', () => {
    const archive = tarGzip([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/large', content: 'x'.repeat(100) },
    ])

    expect(() =>
      inspectNpmTarball(archive, { ...LIMITS, maxFileBytes: 50 }),
    ).toThrowError(expect.objectContaining({ code: 'DEPENDENCY_FILE_QUOTA_EXCEEDED' }))
    expect(() =>
      inspectNpmTarball(archive, { ...LIMITS, maxTotalBytes: 50 }),
    ).toThrowError(expect.objectContaining({ code: 'DEPENDENCY_TOTAL_BYTES_QUOTA_EXCEEDED' }))
  })

  it('rejects gzip expansion beyond the full archive limit', () => {
    const archive = tarGzip([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/compressible', content: 'x'.repeat(20_000) },
    ])

    expect(() =>
      inspectNpmTarball(archive, { ...LIMITS, maxExpandedBytes: 2_000 }),
    ).toThrowError(expect.objectContaining({ code: 'DEPENDENCY_EXPANDED_QUOTA_EXCEEDED' }))
  })

  it('rejects archive checksum corruption and missing package manifest', () => {
    const raw = tar([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/index.js', content: 'ok' },
    ])
    raw[0] = (raw[0] ?? 0) ^ 1
    const corrupted = gzipSync(raw)

    expect(() => inspectNpmTarball(corrupted, LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TAR_CHECKSUM_MISMATCH' }),
    )
    expect(() =>
      inspectNpmTarball(tarGzip([{ name: 'package/index.js', content: 'ok' }]), LIMITS),
    ).toThrowError(expect.objectContaining({ code: 'DEPENDENCY_PACKAGE_MANIFEST_MISSING' }))
  })
})

function tarGzip(entries: readonly TarEntryFixture[]): Buffer {
  return gzipSync(tar(entries))
}

function tar(entries: readonly TarEntryFixture[]): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const type = entry.type ?? 'file'
    const content =
      type === 'file'
        ? Buffer.from(entry.content ?? '')
        : Buffer.alloc(0)
    const header = Buffer.alloc(512)
    writeText(header, 0, 100, entry.name)
    writeOctal(header, 100, 8, type === 'directory' ? 0o755 : 0o644)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, content.byteLength)
    writeOctal(header, 136, 12, 0)
    header.fill(32, 148, 156)
    header[156] = type === 'directory' ? 53 : type === 'symlink' ? 50 : 48
    writeText(header, 257, 6, 'ustar')
    writeText(header, 263, 2, '00')
    writeText(header, 265, 32, 'root')
    writeText(header, 297, 32, 'root')
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    const checksumText = checksum.toString(8).padStart(6, '0')
    header.write(checksumText, 148, 6, 'ascii')
    header[154] = 0
    header[155] = 32
    blocks.push(header)
    if (content.byteLength > 0) {
      const padded = Buffer.alloc(Math.ceil(content.byteLength / 512) * 512)
      content.copy(padded)
      blocks.push(padded)
    }
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

function writeText(buffer: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.byteLength > length) throw new Error(`Tar fixture field too long: ${value}`)
  bytes.copy(buffer, offset)
}

function writeOctal(
  buffer: Buffer,
  offset: number,
  length: number,
  value: number,
): void {
  const text = value.toString(8).padStart(length - 1, '0')
  buffer.write(text, offset, length - 1, 'ascii')
  buffer[offset + length - 1] = 0
}
