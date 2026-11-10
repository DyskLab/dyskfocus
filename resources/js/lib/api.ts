import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

// Same-origin: the SPA is served by Laravel, so relative URLs need no CORS.
const API_URL = import.meta.env.VITE_API_URL ?? ''

/** Talks to the Laravel REST API under /api with Sanctum SPA cookies. */
export const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: 'application/json' },
})

/** Root client for the CSRF-cookie endpoint (outside /api). */
const root = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  withXSRFToken: true,
})

let csrfReady = false

/** Fetch the XSRF-TOKEN cookie once before the first mutating request. */
export async function ensureCsrf(): Promise<void> {
  if (!csrfReady) {
    await root.get('/sanctum/csrf-cookie')
    csrfReady = true
  }
}

// ---- Local-mutation tracking (lets realtime sync skip echoes of our own writes)

let lastLocalMutation = 0

/** True if this tab sent a write within the last `ms` milliseconds. */
export function mutatedLocallyWithin(ms: number): boolean {
  return Date.now() - lastLocalMutation < ms
}

api.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase()
  if (method !== 'get' && method !== 'head') lastLocalMutation = Date.now()
  return config
})

// ---- Session expiry handling

let onUnauthorized: (() => void) | null = null

/** Called (by AuthProvider) when the API reports the session is gone. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn
}

type RetriableConfig = InternalAxiosRequestConfig & { _csrfRetried?: boolean }

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const status = error.response?.status
  const config = error.config as RetriableConfig | undefined

  // 419 = CSRF token mismatch / expired: refresh the cookie and retry once.
  if (status === 419 && config && !config._csrfRetried) {
    config._csrfRetried = true
    csrfReady = false
    await ensureCsrf()
    return api.request(config)
  }

  // 401 = session expired or logged out elsewhere: drop back to the login screen.
  if (status === 401 && onUnauthorized) onUnauthorized()

  return Promise.reject(error)
})

/** Unwrap Laravel API Resource envelopes ({ data: ... }). */
export function unwrap<T>(payload: { data: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data
  }
  return payload as T
}
