import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ensureCsrf, setUnauthorizedHandler, unwrap } from '../lib/api'
import { unsubscribeFromPush } from '../lib/push'
import type { User } from '../lib/types'
import { useUI } from '../store/ui'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string, remember: boolean) => Promise<void>
  register: (name: string, email: string, password: string, passwordConfirmation: string) => Promise<void>
  logout: () => Promise<void>
  updateSettings: (settings: Record<string, unknown>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const setTheme = useUI((s) => s.setTheme)
  const queryClient = useQueryClient()

  function adoptUser(u: User | null) {
    setUser(u)
    const theme = u?.settings?.theme
    if (theme === 'dark' || theme === 'light') setTheme(theme)
  }

  useEffect(() => {
    api
      .get('/user')
      .then(({ data }) => adoptUser(unwrap<User>(data)))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Session expired / revoked: forget the user and every cached list.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      queryClient.clear()
    })
    return () => setUnauthorizedHandler(null)
  }, [queryClient])

  // Keep the server in sync with the browser's timezone (for correct due/today math).
  useEffect(() => {
    if (!user) return
    const tz = canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    if (tz && user.settings?.timezone !== tz) {
      updateSettings({ timezone: tz }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function login(email: string, password: string, remember: boolean) {
    await ensureCsrf()
    const { data } = await api.post('/login', { email, password, remember })
    queryClient.clear() // never show a previous account's cached data
    adoptUser(unwrap<User>(data))
  }

  async function register(name: string, email: string, password: string, passwordConfirmation: string) {
    await ensureCsrf()
    const { data } = await api.post('/register', {
      name,
      email,
      password,
      password_confirmation: passwordConfirmation,
    })
    adoptUser(unwrap<User>(data))
  }

  async function logout() {
    // Stop this browser receiving the account's push notifications.
    await unsubscribeFromPush().catch(() => {})
    try {
      await ensureCsrf()
      await api.post('/logout')
    } catch {
      // Even if the request fails (e.g. session already gone), sign out locally.
    } finally {
      queryClient.clear()
      setUser(null)
    }
  }

  async function updateSettings(settings: Record<string, unknown>) {
    await ensureCsrf()
    const { data } = await api.put('/settings', { settings })
    adoptUser(unwrap<User>(data))
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateSettings }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Map legacy zone aliases (e.g. Asia/Calcutta) to their canonical name when the browser can. */
function canonicalTimeZone(tz: string | undefined): string | undefined {
  if (!tz) return tz
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone
  } catch {
    return tz
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
