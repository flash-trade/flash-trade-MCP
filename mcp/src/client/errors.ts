export class FlashApiError extends Error {
  public readonly responseBody?: string

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
    responseBody?: string,
  ) {
    super(`Flash API error [${statusCode}] ${endpoint}: ${message}`)
    this.name = 'FlashApiError'
    this.responseBody = responseBody?.slice(0, 500)
  }
}

export class FlashApiConnectionError extends Error {
  public readonly endpoint: string

  constructor(endpoint: string, cause: Error) {
    super(`Failed to connect to Flash API at ${endpoint}: ${cause.message}`, { cause })
    this.name = 'FlashApiConnectionError'
    this.endpoint = endpoint
  }
}

const HTTP_MESSAGES: Record<number, string> = {
  400: 'Invalid request parameters',
  404: 'Resource not found',
  422: 'Validation failed',
  429: 'Rate limited — try again shortly',
  500: 'Flash Trade API internal error',
  502: 'Flash Trade API is unreachable',
  503: 'Flash Trade API is temporarily unavailable',
}

export function mapHttpError(status: number, endpoint: string, body: string): FlashApiError {
  return new FlashApiError(HTTP_MESSAGES[status] ?? `HTTP ${status}`, status, endpoint, body)
}
