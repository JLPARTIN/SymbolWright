import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { startChatServer, type StartedChatServer } from './symbolwright-chat-server.js'

const API_KEY = 'test-symbolwright-key'

/**
 * A real OpenAI-compatible HTTP server (not a mock) that scripts a two-turn
 * tool-calling conversation: the first call streams a `read_file` tool call,
 * the second (after the tool result comes back) streams a final answer.
 * Exercising this over real sockets, through the real chat-completions wire
 * format, is what proves the whole stack — HTTP route, request parsing,
 * provider resolution, streaming tool-call parsing, and real tool
 * execution — actually works together, not just each piece in isolation.
 */
function startFakeOpenAiCompatibleServer(): Promise<{
  url: string
  server: Server
  callCount: () => number
}> {
  let calls = 0
  const server = createServer((req, res) => {
    calls += 1
    const thisCall = calls
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      if (thisCall === 1) {
        res.write(
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":""}}]}}]}\n\n',
        )
        res.write(
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":\\"package.json\\"}"}}]}}]}\n\n',
        )
        res.write('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n')
        res.write('data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n')
      } else {
        res.write(
          'data: {"choices":[{"delta":{"content":"The package is named symbolwright."},"finish_reason":"stop"}]}\n\n',
        )
        res.write('data: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":8}}\n\n')
      }
      res.write('data: [DONE]\n\n')
      res.end()
      void body
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({ url: `http://127.0.0.1:${port}/v1`, server, callCount: () => calls })
    })
  })
}

/**
 * A real Gemini-compatible HTTP server scripting the same two-turn
 * tool-calling conversation as the OpenAI fake above, but in Gemini's wire
 * format (candidates/content/parts with functionCall, no incremental
 * argument streaming).
 */
function startFakeGeminiServer(): Promise<{
  url: string
  server: Server
  callCount: () => number
}> {
  let calls = 0
  const server = createServer((req, res) => {
    calls += 1
    const thisCall = calls
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      if (thisCall === 1) {
        res.write(
          'data: {"candidates":[{"content":{"parts":[{"functionCall":{"id":"call_1","name":"read_file","args":{"path":"package.json"}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}\n\n',
        )
      } else {
        res.write(
          'data: {"candidates":[{"content":{"parts":[{"text":"The package is named symbolwright."}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":20,"candidatesTokenCount":8}}\n\n',
        )
      }
      res.end()
      void body
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({ url: `http://127.0.0.1:${port}`, server, callCount: () => calls })
    })
  })
}

let chatServer: StartedChatServer | undefined
let fakeUpstream: Server | undefined

afterEach(async () => {
  if (chatServer !== undefined) {
    await new Promise<void>((resolve) => chatServer?.server.close(() => resolve()))
    chatServer = undefined
  }
  if (fakeUpstream !== undefined) {
    await new Promise<void>((resolve) => fakeUpstream?.close(() => resolve()))
    fakeUpstream = undefined
  }
})

function auth(): Record<string, string> {
  return { authorization: `Bearer ${API_KEY}` }
}

describe('POST /api/agent', () => {
  it('runs a real tool-use loop end to end: streamed tool call, real file read, follow-up completion', async () => {
    const fake = await startFakeOpenAiCompatibleServer()
    fakeUpstream = fake.server

    chatServer = await startChatServer({
      apiKey: API_KEY,
      host: '127.0.0.1',
      port: 0,
      env: {},
    })

    const registerResponse = await fetch(`${chatServer.url}/api/providers/register`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'custom',
        baseUrl: fake.url,
        apiKey: 'sk-fake',
        model: 'fake-model',
      }),
    })
    expect(registerResponse.status).toBe(200)

    const response = await fetch(`${chatServer.url}/api/agent`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'custom',
        mode: 'READ_ONLY',
        message: 'What is this package named? Read package.json to find out.',
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    const result = (await response.json()) as {
      status: string
      finalText: string
      totalIterations: number
      iterations: readonly {
        toolCalls: readonly { name: string }[]
        toolResults: readonly { output: string; isError: boolean }[]
      }[]
      finalMessages: readonly unknown[]
    }

    expect(result.status).toBe('completed')
    expect(result.finalText).toBe('The package is named symbolwright.')
    expect(result.totalIterations).toBe(2)
    expect(result.iterations[0]?.toolCalls[0]?.name).toBe('read_file')
    expect(result.iterations[0]?.toolResults[0]?.isError).toBe(false)
    expect(result.iterations[0]?.toolResults[0]?.output).toContain('"name": "symbolwright"')
    expect(result.finalMessages.length).toBeGreaterThan(0)
    expect(fake.callCount()).toBe(2)
  })

  it('streams agent events as SSE and includes a final result frame', async () => {
    const fake = await startFakeOpenAiCompatibleServer()
    fakeUpstream = fake.server
    chatServer = await startChatServer({ apiKey: API_KEY, host: '127.0.0.1', port: 0, env: {} })

    await fetch(`${chatServer.url}/api/providers/register`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'custom',
        baseUrl: fake.url,
        apiKey: 'sk-fake',
        model: 'fake-model',
      }),
    })

    const response = await fetch(`${chatServer.url}/api/agent`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'custom',
        mode: 'READ_ONLY',
        message: 'Read package.json',
        stream: true,
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const text = await response.text()

    expect(text).toContain('event: tool_call_start')
    expect(text).toContain('event: tool_call_end')
    expect(text).toContain('event: result')
    expect(text).toContain('event: done')
    expect(text).toContain('"finalText":"The package is named symbolwright."')
  })

  it('runs a real tool-use loop against google-gemini end to end', async () => {
    const fake = await startFakeGeminiServer()
    fakeUpstream = fake.server

    chatServer = await startChatServer({ apiKey: API_KEY, host: '127.0.0.1', port: 0, env: {} })

    const registerResponse = await fetch(`${chatServer.url}/api/providers/register`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'google-gemini',
        baseUrl: fake.url,
        apiKey: 'gem-fake',
        model: 'fake-gemini-model',
      }),
    })
    expect(registerResponse.status).toBe(200)

    const response = await fetch(`${chatServer.url}/api/agent`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'google-gemini',
        mode: 'READ_ONLY',
        message: 'What is this package named? Read package.json to find out.',
        stream: false,
      }),
    })

    expect(response.status).toBe(200)
    const result = (await response.json()) as {
      status: string
      finalText: string
      iterations: readonly { toolCalls: readonly { name: string }[] }[]
    }
    expect(result.status).toBe('completed')
    expect(result.finalText).toBe('The package is named symbolwright.')
    expect(result.iterations[0]?.toolCalls[0]?.name).toBe('read_file')
    expect(fake.callCount()).toBe(2)
  })

  it('rejects a missing message with 400', async () => {
    chatServer = await startChatServer({ apiKey: API_KEY, host: '127.0.0.1', port: 0, env: {} })

    const response = await fetch(`${chatServer.url}/api/agent`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'openai' }),
    })

    expect(response.status).toBe(400)
  })

  it('requires authentication', async () => {
    chatServer = await startChatServer({ apiKey: API_KEY, host: '127.0.0.1', port: 0, env: {} })

    const response = await fetch(`${chatServer.url}/api/agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerId: 'openai', message: 'hi' }),
    })

    expect(response.status).toBe(401)
  })
})
