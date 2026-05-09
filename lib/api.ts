export interface ApiResponse<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
  field?: string
}

export type ApiResult<T> = ApiResponse<T> | ApiError

/**
 * GET from the bridge server via the Next.js proxy route.
 * The proxy injects the BRIDGE_API_KEY server-side.
 */
export async function bridgeGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/bridge/${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (res.status === 401) {
      // Trigger session refresh on auth failure
      window.location.href = '/login'
      return { success: false, error: 'Unauthorized' }
    }

    const data = await res.json()
    return data as ApiResult<T>
  } catch {
    return { success: false, error: 'Network error' }
  }
}

/**
 * POST to the bridge server via the Next.js proxy route.
 * The proxy injects the BRIDGE_API_KEY server-side.
 */
export async function bridgePost<T>(
  path: string,
  body: unknown
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/bridge/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.status === 401) {
      window.location.href = '/login'
      return { success: false, error: 'Unauthorized' }
    }

    const data = await res.json()
    return data as ApiResult<T>
  } catch {
    return { success: false, error: 'Network error' }
  }
}
