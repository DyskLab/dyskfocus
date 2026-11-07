import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, Download, Heart, Settings, Upload } from 'lucide-react'
import PageShell from '../components/PageShell'
import { useAuth } from '../auth/AuthContext'
import { useUI } from '../store/ui'
import { api, ensureCsrf } from '../lib/api'
import { NAV_META, NAV_TOGGLE_KEYS } from '../lib/navmeta'
import { isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush } from '../lib/push'
import { isDesktop } from '../lib/env'
import { showConfirm } from '../store/dialog'

export default function SettingsPage() {
  const { user, updateSettings } = useAuth()
  const { theme, setTheme } = useUI()
  const setSelectedTask = useUI((s) => s.setSelectedTask)
  const remindersEnabled = useUI((s) => s.remindersEnabled)
  const setRemindersEnabled = useUI((s) => s.setRemindersEnabled)
  const hiddenNav = useUI((s) => s.hiddenNav)
  const setNavHidden = useUI((s) => s.setNavHidden)
  const [reminderMsg, setReminderMsg] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const pushSupported = isPushSupported() && !isDesktop
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  useEffect(() => {
    if (pushSupported) isSubscribed().then(setPushOn).catch(() => {})
  }, [pushSupported])

  async function togglePush() {
    setPushBusy(true)
    setPushMsg(null)
    try {
      if (pushOn) {
        await unsubscribeFromPush()
        setPushOn(false)
        setPushMsg('Push notifications turned off.')
      } else {
        await subscribeToPush()
        setPushOn(true)
        setPushMsg('Push on — you’ll be notified about due tasks even when DyskFocus is closed.')
      }
    } catch (e: unknown) {
      setPushMsg((e as Error)?.message ?? 'Could not update push notifications.')
    } finally {
      setPushBusy(false)
    }
  }

  function changeTheme(next: 'light' | 'dark') {
    setTheme(next)
    updateSettings({ theme: next }).catch(() => {})
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    try {
      await ensureCsrf()
      await api.put('/password', {
        current_password: pw.current,
        password: pw.next,
        password_confirmation: pw.confirm,
      })
      setPwMsg({ ok: true, text: 'Password updated.' })
      setPw({ current: '', next: '', confirm: '' })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setPwMsg({ ok: false, text: e.response?.data?.message ?? 'Update failed.' })
    }
  }

  async function toggleReminders() {
    if (remindersEnabled) {
      setRemindersEnabled(false)
      setReminderMsg(null)
      return
    }
    if (!('Notification' in window)) {
      setReminderMsg('This browser does not support notifications.')
      return
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm === 'granted') {
      setRemindersEnabled(true)
      setReminderMsg('Reminders on — you’ll be notified about due tasks while DyskFocus is open.')
      try {
        new Notification('DyskFocus', { body: 'Due-date reminders are on.' })
      } catch {
        /* ignore */
      }
    } else {
      setRemindersEnabled(false)
      setReminderMsg('Permission denied. Allow notifications for this site in your browser settings.')
    }
  }

  async function handleExport() {
    setBusy(true)
    setMsg(null)
    try {
      const { data } = await api.get('/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dyskfocus-backup-${String(data.exported_at ?? '').slice(0, 10) || 'export'}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setMsg({ kind: 'err', text: 'Export failed.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(file: File) {
    if (
      !(await showConfirm({
        title: 'Replace all data?',
        message: 'Importing will REPLACE all of your current data with the backup.',
        confirmText: 'Import & replace',
        danger: true,
      }))
    )
      return
    setBusy(true)
    setMsg(null)
    try {
      const json = JSON.parse(await file.text())
      await ensureCsrf()
      await api.post('/import', json)
      setSelectedTask(null)
      await queryClient.invalidateQueries()
      setMsg({ kind: 'ok', text: 'Import successful — your data has been restored.' })
    } catch {
      setMsg({ kind: 'err', text: 'Import failed — the file is not a valid DyskFocus backup.' })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <PageShell title="Settings" icon={<Settings />}>
      <div className="space-y-6 p-5">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Account</h2>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-sm">
            <div className="font-medium">{user?.name}</div>
            <div className="text-slate-400">{user?.email}</div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Appearance</h2>
          <div className="flex gap-2">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => changeTheme(t)}
                className={`rounded-lg border px-4 py-2 text-sm capitalize ${
                  theme === t
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500'
                }`}
              >
                {t} mode
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">Your theme preference is saved to your account.</p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-semibold">Sidebar</h2>
          <p className="mb-3 text-xs text-slate-400">
            Choose which items show in the sidebar. Hidden items stay reachable by URL. Saved in this browser.
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            {NAV_TOGGLE_KEYS.map((key) => {
              const meta = NAV_META[key]
              const visible = !hiddenNav[key]
              return (
                <li key={key} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{meta.label}</div>
                    <div className="text-xs text-slate-400">{meta.desc}</div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={visible}
                    aria-label={`${visible ? 'Hide' : 'Show'} ${meta.label}`}
                    onClick={() => setNavHidden(key, visible)}
                    className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      visible ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        visible ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Reminders</h2>
          <button
            onClick={toggleReminders}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
              remindersEnabled
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-slate-200 dark:border-slate-700 text-slate-500'
            }`}
          >
            <Bell size={16} /> Due-date reminders: {remindersEnabled ? 'On' : 'Off'}
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Shows a browser notification for tasks that are due, while DyskFocus is open in this browser.
          </p>
          {reminderMsg && <p className="mt-1 text-xs text-slate-500">{reminderMsg}</p>}
        </section>

        {!isDesktop && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Push notifications</h2>
          <button
            onClick={togglePush}
            disabled={!pushSupported || pushBusy}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50 ${
              pushOn
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-slate-200 dark:border-slate-700 text-slate-500'
            }`}
          >
            <BellRing size={16} /> Push notifications: {pushOn ? 'On' : 'Off'}
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Sends a notification when a task becomes due — even when DyskFocus is closed. Delivered to this device;
            enable it on each device you want alerts on.
          </p>
          {!pushSupported && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              This browser doesn’t support push notifications (install DyskFocus as an app, or use a supported browser).
            </p>
          )}
          {pushMsg && <p className="mt-1 text-xs text-slate-500">{pushMsg}</p>}
        </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold">Password</h2>
          <form onSubmit={changePassword} className="max-w-xs space-y-2">
            <input
              type="password"
              placeholder="Current password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              className={pwInput}
              required
            />
            <input
              type="password"
              placeholder="New password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              className={pwInput}
              required
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              className={pwInput}
              required
            />
            <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Change password
            </button>
            {pwMsg && (
              <p className={`text-xs ${pwMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{pwMsg.text}</p>
            )}
          </form>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Data</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand disabled:opacity-50"
            >
              <Download size={16} /> Export backup (.json)
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand disabled:opacity-50"
            >
              <Upload size={16} /> Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleImport(f)
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Export downloads everything (projects, tasks, tags, perspectives, comments). Importing{' '}
            <strong>replaces</strong> your current data with the backup.
          </p>
          {msg && (
            <p className={`mt-2 text-xs ${msg.kind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {msg.text}
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Support</h2>
          <a
            href="https://buymeacoffee.com/fannydevz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand"
          >
            <Heart size={16} /> Support DyskFocus
          </a>
          <p className="mt-2 text-xs text-slate-400">If DyskFocus is useful to you, you can support its development on Buy Me a Coffee.</p>
        </section>
      </div>
    </PageShell>
  )
}

const pwInput =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand'
