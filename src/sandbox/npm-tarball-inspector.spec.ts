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

const TAR_BLOCK_BYTES = 512
const SECOND_HEADER_OFFSET = TAR_BLOCK_BYTES * 2

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
      { path: 'package', type: 'directory', size: 0 },
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

  it('rejects compressed and expanded archive quota violations', () => {
    const archive = tarGzip([{ name: 'package/package.json', content: '{}' }])

    expect(() =>
      inspectNpmTarball(archive, { ...LIMITS, maxArchiveBytes: archive.byteLength - 1 }),
    ).toThrowError(expect.objectContaining({ code: 'DEPENDENCY_ARCHIVE_QUOTA_EXCEEDED' }))

    expect(() => inspectNpmTarball(archive, { ...LIMITS, maxExpandedBytes: 1_200 })).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_EXPANDED_QUOTA_EXCEEDED' }),
    )
  })

  it('rejects invalid gzip and unaligned tar streams', () => {
    expect(() => inspectNpmTarball(Buffer.from('not-a-gzip-stream'), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_ARCHIVE_INVALID' }),
    )
    expect(() => inspectNpmTarball(gzipSync(Buffer.alloc(513)), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TAR_INVALID' }),
    )
  })

  it.each([
    '../escape',
    'package/../../escape',
    'package//alias',
    'package/./alias',
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

  it('normalizes backslashes and ustar prefixes without accepting aliases', () => {
    const raw = tar([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/placeholder', content: '' },
      { name: 'package\\windows.js', content: '' },
    ])
    const secondHeader = raw.subarray(SECOND_HEADER_OFFSET, SECOND_HEADER_OFFSET + TAR_BLOCK_BYTES)
    secondHeader.fill(0, 0, 100)
    secondHeader.fill(0, 345, 500)
    Buffer.from('a'.repeat(100), 'ascii').copy(secondHeader, 0)
    Buffer.from('package', 'ascii').copy(secondHeader, 345)
    recomputeChecksum(raw, SECOND_HEADER_OFFSET)

    const report = inspectNpmTarball(gzipSync(raw), LIMITS)

    expect(report.entries.map((entry) => entry.path)).toEqual([
      'package/package.json',
      `package/${'a'.repeat(100)}`,
      'package/windows.js',
    ])
  })

  it('rejects empty, control-character, and invalid UTF-8 paths', () => {
    expect(() =>
      inspectNpmTarball(
        tarGzip([
          { name: '', content: '' },
          { name: 'package/package.json', content: '{}' },
        ]),
        LIMITS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'DEPENDENCY_ARCHIVE_PATH_INVALID' }))

    expect(() =>
      inspectNpmTarball(
        tarGzip([
          { name: 'package/package.json', content: '{}' },
          { name: 'package/\u0001control', content: '' },
        ]),
        LIMITS,
      ),
    ).toThrowError(expect.objectContaining({ code: 'DEPENDENCY_ARCHIVE_PATH_INVALID' }))

    const invalidUtf8 = tar([{ name: 'package/package.json', content: '{}' }])
    invalidUtf8[0] = 0xff
    recomputeChecksum(invalidUtf8, 0)
    expect(() => inspectNpmTarball(gzipSync(invalidUtf8), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_ARCHIVE_PATH_INVALID' }),
    )
  })

  it.each([49, 50])('rejects archive link type %i', (typeFlag) => {
    const raw = tar([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/link', type: 'symlink' },
    ])
    raw[SECOND_HEADER_OFFSET + 156] = typeFlag
    recomputeChecksum(raw, SECOND_HEADER_OFFSET)

    expect(() => inspectNpmTarball(gzipSync(raw), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_ARCHIVE_LINK_FORBIDDEN' }),
    )
  })

  it.each([
    [51, 'DEPENDENCY_ARCHIVE_SPECIAL_FILE_FORBIDDEN'],
    [52, 'DEPENDENCY_ARCHIVE_SPECIAL_FILE_FORBIDDEN'],
    [54, 'DEPENDENCY_ARCHIVE_SPECIAL_FILE_FORBIDDEN'],
    [55, 'DEPENDENCY_TAR_TYPE_UNSUPPORTED'],
  ] as const)('rejects special or unsupported archive type %i', (typeFlag, code) => {
    const raw = tar([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/device', content: '' },
    ])
    raw[SECOND_HEADER_OFFSET + 156] = typeFlag
    recomputeChecksum(raw, SECOND_HEADER_OFFSET)

    expect(() => inspectNpmTarball(gzipSync(raw), LIMITS)).toThrowError(
      expect.objectContaining({ code }),
    )
  })

  it('accepts the legacy null regular-file type flag and an empty numeric size field', () => {
    const raw = tar([{ name: 'package/package.json', content: '' }])
    raw[156] = 0
    raw.fill(0, 124, 136)
    recomputeChecksum(raw, 0)

    const report = inspectNpmTarball(gzipSync(raw), LIMITS)

    expect(report.entries).toEqual([{ path: 'package/package.json', type: 'file', size: 0 }])
  })

  it('rejects binary and invalid-octal tar sizes', () => {
    const binary = tar([{ name: 'package/package.json', content: '{}' }])
    binary.fill(0, 124, 136)
    binary[124] = 0x80
    recomputeChecksum(binary, 0)
    expect(() => inspectNpmTarball(gzipSync(binary), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TAR_NUMBER_UNSUPPORTED' }),
    )

    const invalidOctal = tar([{ name: 'package/package.json', content: '{}' }])
    invalidOctal.fill(0, 124, 136)
    Buffer.from('00000000008', 'ascii').copy(invalidOctal, 124)
    recomputeChecksum(invalidOctal, 0)
    expect(() => inspectNpmTarball(gzipSync(invalidOctal), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TAR_INVALID' }),
    )
  })

  it('rejects a directory that declares file content', () => {
    const raw = tar([
      { name: 'package/', type: 'directory' },
      { name: 'package/package.json', content: '{}' },
    ])
    writeOctal(raw, 124, 12, 1)
    recomputeChecksum(raw, 0)

    expect(() => inspectNpmTarball(gzipSync(raw), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TAR_INVALID' }),
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

    expect(() => inspectNpmTarball(archive, { ...LIMITS, maxFileBytes: 50 })).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_FILE_QUOTA_EXCEEDED' }),
    )
    expect(() => inspectNpmTarball(archive, { ...LIMITS, maxTotalBytes: 50 })).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TOTAL_BYTES_QUOTA_EXCEEDED' }),
    )
  })

  it('rejects gzip expansion beyond the decompressor limit', () => {
    const archive = tarGzip([
      { name: 'package/package.json', content: '{}' },
      { name: 'package/compressible', content: 'x'.repeat(20_000) },
    ])

    expect(() => inspectNpmTarball(archive, { ...LIMITS, maxExpandedBytes: 2_000 })).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_EXPANDED_QUOTA_EXCEEDED' }),
    )
  })

  it('rejects truncated entries and missing terminal records', () => {
    const oversizedEntry = tar([{ name: 'package/package.json', content: '{}' }])
    writeOctal(oversizedEntry, 124, 12, 4_096)
    recomputeChecksum(oversizedEntry, 0)
    expect(() =>
      inspectNpmTarball(gzipSync(oversizedEntry), {
        ...LIMITS,
        maxFileBytes: 10_000,
        maxTotalBytes: 10_000,
      }),
    ).toThrowError(expect.objectContaining({ code: 'DEPENDENCY_TAR_TRUNCATED' }))

    const noEndRecords = tar([{ name: 'package/package.json', content: '{}' }]).subarray(0, 1_024)
    expect(() => inspectNpmTarball(gzipSync(noEndRecords), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TAR_TRUNCATED' }),
    )
  })

  it('rejects data after the first end-of-archive record', () => {
    const first = tar([{ name: 'package/package.json', content: '{}' }]).subarray(0, 1_024)
    const late = tar([{ name: 'package/late.js', content: 'late' }]).subarray(0, 1_024)
    const raw = Buffer.concat([first, Buffer.alloc(512), late, Buffer.alloc(1_024)])

    expect(() => inspectNpmTarball(gzipSync(raw), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TAR_INVALID' }),
    )
  })

  it('rejects empty archives, checksum corruption, and missing package manifests', () => {
    expect(() => inspectNpmTarball(gzipSync(Buffer.alloc(1_024)), LIMITS)).toThrowError(
      expect.objectContaining({ code: 'DEPENDENCY_TAR_EMPTY' }),
    )

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
    const content = type === 'file' ? Buffer.from(entry.content ?? '') : Buffer.alloc(0)
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

function recomputeChecksum(raw: Buffer, headerOffset: number): void {
  const header = raw.subarray(headerOffset, headerOffset + TAR_BLOCK_BYTES)
  header.fill(32, 148, 156)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  const checksumText = checksum.toString(8).padStart(6, '0')
  header.write(checksumText, 148, 6, 'ascii')
  header[154] = 0
  header[155] = 32
}

function writeText(buffer: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.byteLength > length) throw new Error(`Tar fixture field too long: ${value}`)
  bytes.copy(buffer, offset)
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const text = value.toString(8).padStart(length - 1, '0')
  buffer.write(text, offset, length - 1, 'ascii')
  buffer[offset + length - 1] = 0
}
