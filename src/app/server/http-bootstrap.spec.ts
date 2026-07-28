import { connect } from 'node:net'
import { describe, expect, it } from 'vitest'

import { createAndStartHttpServer, ShutdownLifecycle } from './http-bootstrap.js'

describe('createAndStartHttpServer', () => {
  it('starts an http server and resolves a working url/host/port', async () => {
    const started = await createAndStartHttpServer((_req, res) => res.end('ok'), {
      host: '127.0.0.1',
      port: 0,
    })
    try {
      expect(started.protocol).toBe('http')
      expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
      const response = await fetch(started.url)
      expect(await response.text()).toBe('ok')
    } finally {
      await started.close()
    }
  })

  it('close() resolves once the server stops accepting connections', async () => {
    const started = await createAndStartHttpServer((_req, res) => res.end('ok'), {
      host: '127.0.0.1',
      port: 0,
    })
    await started.close()
    await expect(fetch(started.url)).rejects.toThrow()
  })

  it('force-destroys a connection still open past the hard-kill deadline', async () => {
    const started = await createAndStartHttpServer(
      (_req, res) => {
        // Never respond -- simulates a long-lived SSE stream that doesn't end on its own.
        void res
      },
      { host: '127.0.0.1', port: 0 },
    )

    const socket = connect(started.port, started.host)
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()))
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n')

    const closedAt = Date.now()
    await started.close(50)
    expect(Date.now() - closedAt).toBeLessThan(2_000)
    socket.destroy()
  })
})

describe('ShutdownLifecycle', () => {
  it('runs every registered hook', async () => {
    const lifecycle = new ShutdownLifecycle()
    const calls: string[] = []
    lifecycle.onBeforeShutdown(() => {
      calls.push('a')
    })
    lifecycle.onBeforeShutdown(async () => {
      calls.push('b')
    })
    await lifecycle.runHooks()
    expect(calls).toEqual(['a', 'b'])
  })

  it('a throwing hook does not prevent the remaining hooks from running', async () => {
    const lifecycle = new ShutdownLifecycle()
    const calls: string[] = []
    lifecycle.onBeforeShutdown(() => {
      throw new Error('boom')
    })
    lifecycle.onBeforeShutdown(() => {
      calls.push('ran anyway')
    })
    await expect(lifecycle.runHooks()).resolves.toBeUndefined()
    expect(calls).toEqual(['ran anyway'])
  })
})
