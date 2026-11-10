import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutatedLocallyWithin } from '../lib/api'

/** Changes this tab made itself are already applied (optimistically + via invalidation). */
const OWN_ECHO_WINDOW_MS = 4000

/**
 * Keeps this tab in sync with changes made elsewhere (other tabs/devices).
 * Subscribes to the server's SSE stream and invalidates cached queries when
 * the user's data changes. EventSource reconnects automatically, including
 * after the server caps a connection to free php-fpm workers.
 *
 * While the tab is hidden the stream is closed (each open stream holds a PHP
 * worker). On return it reopens with the last version seen, so anything that
 * changed in the meantime still triggers a refresh.
 */
export function useRealtimeSync(enabled: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return

    let es: EventSource | null = null
    let lastVersion: string | null = null
    let pending: ReturnType<typeof setTimeout> | undefined

    const onSync = (e: MessageEvent) => {
      if (e.lastEventId) lastVersion = e.lastEventId
      // Skip the echo of our own write — refetching would e.g. yank a just-ticked
      // task off the list before it can be unticked. Changes from elsewhere in
      // the same window are picked up by the next event or the next refetch.
      if (mutatedLocallyWithin(OWN_ECHO_WINDOW_MS)) return
      // Coalesce bursts (bulk edits elsewhere) into one refetch.
      clearTimeout(pending)
      pending = setTimeout(() => queryClient.invalidateQueries(), 300)
    }
    // The server sends the current version (as the event id) on connect.
    const onOpenId = (e: MessageEvent) => {
      if (e.lastEventId) lastVersion = e.lastEventId
    }

    function open() {
      if (es) return
      // Same-origin: cookies (Sanctum session) are sent automatically.
      const url = lastVersion ? `/api/stream?last=${encodeURIComponent(lastVersion)}` : '/api/stream'
      es = new EventSource(url, { withCredentials: true })
      es.addEventListener('sync', onSync as EventListener)
      es.addEventListener('hello', onOpenId as EventListener)
    }

    function close() {
      es?.close()
      es = null
    }

    function onVisibility() {
      if (document.hidden) close()
      else open()
    }

    if (!document.hidden) open()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(pending)
      close()
    }
  }, [enabled, queryClient])
}
