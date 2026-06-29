import type { ProviderHttpRequest, ProviderHttpResponse, ProviderHttpTransport } from './provider-gateway.types.js'

export class FetchProviderHttpTransport implements ProviderHttpTransport {
  public async request(request: ProviderHttpRequest): Promise<ProviderHttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })

    const contentType = response.headers.get('content-type') ?? ''
    const body = contentType.includes('application/json')
      ? ((await response.json()) as unknown)
      : await response.text()

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  }
}
