import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api, unwrap } from '../lib/api'
import type { Task } from '../lib/types'
import { useUI } from '../store/ui'

/**
 * While enabled (Settings toggle + granted browser permission), periodically
 * checks the Today view and fires a browser notification for each due task,
 * once per session. Only works while the app is open (no service worker/push).
 */
export function useDueReminders() {
  const enabled = useUI((s) => s.remindersEnabled)
  const notified = useRef<Set<number>>(new Set())

  const active =
    enabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'

  const { data } = useQuery({
    queryKey: ['due-reminders'],
    enabled: active,
    queryFn: async () => unwrap<Task[]>((await api.get('/views/today')).data),
    refetchInterval: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!active || !data) return
    const today = format(new Date(), 'yyyy-MM-dd')
    for (const t of data) {
      // Only remind about tasks that are actually due today or overdue.
      if (t.due_date && t.due_date <= today && !notified.current.has(t.id)) {
        notified.current.add(t.id)
        try {
          new Notification('DyskFocus — task due', { body: t.title })
        } catch {
          /* notifications unavailable */
        }
      }
    }
  }, [data, active])
}
