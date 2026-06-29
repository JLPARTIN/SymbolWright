import type {
  ProviderHttpRequest,
  ProviderHttpResponse,
  ProviderHttpTransport,
} from './provider-gateway.types.js'

export class FetchProviderHttpTransport implements ProviderHttpTransport {
  public async request(request: ProviderHttpRequest): Promise<ProviderHttpResponse> {
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
    }
    const response = await fetch(request.url, init)

    const contentType = response.headers.get('content-type') ?? ''
    const body = contentType.includes('application/json')
      ? ((await response.json()) as unknown)
      : await response.text()
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      status: response.status,
      headers,
      body,
    }
  }
}
