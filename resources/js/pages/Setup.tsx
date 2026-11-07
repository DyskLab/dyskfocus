import { useRef, useState } from 'react'
import { Check, Database, Download, Loader2, UserPlus } from 'lucide-react'
import Logo from '../components/Logo'
import { api, ensureCsrf } from '../lib/api'

export interface SetupStatus {
  migrated: boolean
  has_users: boolean
  needs_setup: boolean
}

type Step = 'migrate' | 'register' | 'import'

function readError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } } }
  return e.response?.data?.message ?? fallback
}

export default function Setup({ status: initial }: { status: SetupStatus }) {
  const [status, setStatus] = useState<SetupStatus>(initial)
  const [step, setStep] = useState<Step>(initial.migrated ? 'register' : 'migrate')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  async function runMigrate() {
    setBusy(true)
    setErr(null)
    try {
      const { data } = await api.post<SetupStatus & { output?: string }>('/setup/migrate')
      setStatus(data)
      if (data.migrated) setStep('register')
      else setErr('Migration did not complete. Run it manually (see below), then click “I’ve run it”.')
    } catch (e) {
      setErr(readError(e, 'Could not run migrations from the browser. Run it manually (see below).'))
    } finally {
      setBusy(false)
    }
  }

  async function recheck() {
    setBusy(true)
    setErr(null)
    try {
      const { data } = await api.get<SetupStatus>('/setup/status')
      setStatus(data)
      if (data.migrated) setStep('register')
      else setErr('Still not migrated — make sure the command ran without errors.')
    } finally {
      setBusy(false)
    }
  }

  async function register(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setErr('Passwords do not match.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await ensureCsrf()
      await api.post('/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        password_confirmation: form.confirm,
      })
      setStep('import')
    } catch (e) {
      setErr(readError(e, 'Could not create the account.'))
    } finally {
      setBusy(false)
    }
  }

  async function importFile(file: File) {
    setBusy(true)
    setErr(null)
    try {
      const json = JSON.parse(await file.text())
      await ensureCsrf()
      await api.post('/import', json)
      finish()
    } catch {
      setErr('Import failed — the file is not a valid DyskFocus backup.')
    } finally {
      setBusy(false)
    }
  }

  function finish() {
    // Hard reload so the app re-bootstraps cleanly (now migrated + logged in).
    window.location.assign('/')
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl">
        <div className="mb-1 flex items-center gap-2">
          <Logo size={24} />
          <h1 className="text-xl font-semibold">DyskFocus</h1>
        </div>
        <p className="mb-6 text-sm text-slate-500">First-run setup</p>

        <Stepper step={step} status={status} />

        {err && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
            {err}
          </div>
        )}

        {step === 'migrate' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              No database yet. Create the tables to get started.
            </p>
            <button onClick={runMigrate} disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
              Run migrations
            </button>
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer">Prefer the command line?</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-slate-600 dark:text-slate-300">
php artisan migrate --force
# DDEV: ddev artisan migrate --force</pre>
              <button onClick={recheck} disabled={busy} className={`${ghostBtn} mt-2`}>
                I’ve run it — re-check
              </button>
            </details>
          </div>
        )}

        {step === 'register' && (
          <form onSubmit={register} className="space-y-3">
            <p className="text-sm text-slate-500">Create the first account (this is the owner).</p>
            <input
              className={inputCls}
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              type="email"
              className={inputCls}
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              type="password"
              className={inputCls}
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <input
              type="password"
              className={inputCls}
              placeholder="Confirm password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              required
            />
            <button disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              Create account
            </button>
          </form>
        )}

        {step === 'import' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Optionally restore a previous backup, or start fresh.
            </p>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Import backup (.json)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importFile(f)
              }}
            />
            <button onClick={finish} disabled={busy} className={ghostBtn}>
              Skip — start with an empty workspace
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stepper({ step, status }: { step: Step; status: SetupStatus }) {
  const items: { key: Step; label: string }[] = [
    { key: 'migrate', label: 'Database' },
    { key: 'register', label: 'Account' },
    { key: 'import', label: 'Import' },
  ]
  const order: Step[] = ['migrate', 'register', 'import']
  const current = order.indexOf(step)

  return (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {items.map((it, i) => {
        const done = i < current || (it.key === 'migrate' && status.migrated && step !== 'migrate')
        const active = it.key === step
        return (
          <li key={it.key} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                done
                  ? 'bg-brand text-white'
                  : active
                    ? 'border-2 border-brand text-brand'
                    : 'border border-slate-300 text-slate-400 dark:border-slate-600'
              }`}
            >
              {done ? <Check size={13} /> : i + 1}
            </span>
            <span className={active ? 'font-medium text-slate-700 dark:text-slate-200' : 'text-slate-400'}>
              {it.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand'
const primaryBtn =
  'flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50'
const ghostBtn =
  'flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand disabled:opacity-50'
