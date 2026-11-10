import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/ui'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

const GO: Record<string, string> = {
  i: '/inbox',
  t: '/today',
  f: '/forecast',
  l: '/flagged',
  r: '/review',
  p: '/projects',
  s: '/search',
}

/** Global keyboard shortcuts (mounted once inside the authenticated Layout). */
export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const { setSelectedTask, setHelpOpen } = useUI.getState()
  const gPending = useRef(false)
  const gTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Esc works even while typing (blurs handled by the field itself).
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return // a modal/popover already handled it
        if (useUI.getState().helpOpen) return setHelpOpen(false)
        if (useUI.getState().selectedTaskId != null) return setSelectedTask(null)
        return
      }

      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return

      // Chord: "g" then a destination key.
      if (gPending.current) {
        gPending.current = false
        clearTimeout(gTimer.current)
        const dest = GO[e.key.toLowerCase()]
        if (dest) {
          e.preventDefault()
          setHelpOpen(false)
          navigate(dest)
        }
        return
      }
      if (e.key === 'g') {
        gPending.current = true
        gTimer.current = window.setTimeout(() => {
          gPending.current = false
        }, 1200)
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(!useUI.getState().helpOpen)
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        navigate('/search')
        return
      }
      if (e.key === 'c') {
        const quickAdd = document.querySelector('[data-quickadd]') as HTMLInputElement | null
        if (quickAdd) {
          e.preventDefault()
          quickAdd.focus()
        } else {
          navigate('/inbox')
        }
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, setHelpOpen, setSelectedTask])
}
