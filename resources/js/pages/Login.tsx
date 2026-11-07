import { useState, type FormEvent } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useUI } from '../store/ui'
import Logo from '../components/Logo'
import { api, ensureCsrf } from '../lib/api'

export default function Login() {
  const { login, register } = useAuth()
  const { theme, toggleTheme } = useUI()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('demo@dyskfocus.test')
  const [password, setPassword] = useState('password')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password, remember)
      } else if (mode === 'register') {
        await register(name, email, password, confirm)
      } else {
        await ensureCsrf()
        await api.post('/forgot-password', { email })
        setInfo('If that email exists, a reset link has been sent (check Mailpit in DDEV).')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 rounded-full p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 p-8">
        <div className="mb-6 flex items-center gap-2">
          <Logo size={24} />
          <h1 className="text-xl font-semibold">DyskFocus</h1>
        </div>
        <p className="mb-6 text-sm text-slate-500">
          {mode === 'login' ? 'Sign in to your tasks.' : mode === 'register' ? 'Create your account.' : 'Reset your password by email.'}
        </p>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <Field label="Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          )}
          <Field label="Email">
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {mode !== 'forgot' && (
            <Field label="Password">
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          )}
          {mode === 'register' && (
            <Field label="Confirm password">
              <input
                type="password"
                className={inputCls}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
          )}

          {mode === 'login' && (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me for 1 year
            </label>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {info && <p className="text-sm text-green-600 dark:text-green-400">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        {mode === 'login' && (
          <button
            onClick={() => {
              setMode('forgot')
              setError(null)
              setInfo(null)
            }}
            className="mt-3 w-full text-center text-xs text-slate-400 hover:text-brand"
          >
            Forgot password?
          </button>
        )}
        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
            setInfo(null)
          }}
          className="mt-4 w-full text-center text-sm text-brand hover:underline"
        >
          {mode === 'login'
            ? "Don't have an account? Register"
            : mode === 'register'
              ? 'Already have an account? Sign in'
              : 'Back to sign in'}
        </button>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
