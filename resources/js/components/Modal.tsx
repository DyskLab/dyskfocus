import { useEffect, useRef, type ReactNode } from 'react'

/** Open modals, innermost last — only the top one reacts to Escape. */
const modalStack: symbol[] = []

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/**
 * Responsive modal shell: a centered card on desktop, a bottom sheet on mobile.
 * Click-outside and Escape both call onClose.
 */
export default function Modal({
  onClose,
  children,
  className = '',
}: {
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const panelRef = useRef<HTMLDivElement>(null)
  // Captured during the first render — before a child's autoFocus moves focus.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined)
  if (openerRef.current === undefined) openerRef.current = document.activeElement as HTMLElement | null

  // Move focus into the dialog, keep Tab inside it, and give focus back to
  // whatever opened it when it closes.
  useEffect(() => {
    const opener = openerRef.current
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>('[autofocus]') ?? panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus()
    }

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    panel?.addEventListener('keydown', onTab)

    return () => {
      panel?.removeEventListener('keydown', onTab)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  useEffect(() => {
    const id = Symbol('modal')
    modalStack.push(id)
    // Capture phase on window runs before the global shortcut handler, so
    // Escape closes just this modal and not the Inspector underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || modalStack[modalStack.length - 1] !== id) return
      e.preventDefault()
      e.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      const i = modalStack.indexOf(id)
      if (i !== -1) modalStack.splice(i, 1)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full outline-none rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:max-w-sm md:rounded-2xl ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
