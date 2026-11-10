import { X } from 'lucide-react'
import { useUI } from '../store/ui'

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Navigation',
    items: [
      ['g i', 'Go to Inbox'],
      ['g t', 'Go to Today'],
      ['g f', 'Go to Forecast'],
      ['g l', 'Go to Flagged'],
      ['g r', 'Go to Review'],
      ['g p', 'Go to Projects'],
      ['g s', 'Go to Search'],
    ],
  },
  {
    title: 'Actions',
    items: [
      ['/', 'Search'],
      ['c', 'New task (focus quick-add)'],
      ['?', 'Toggle this help'],
      ['Esc', 'Close panel / inspector'],
    ],
  },
]

function Keys({ combo }: { combo: string }) {
  return (
    <span className="flex items-center gap-1">
      {combo.split(' ').map((k, i) => (
        <kbd
          key={i}
          className="rounded border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-300"
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}

export default function ShortcutsHelp() {
  const setHelpOpen = useUI((s) => s.setHelpOpen)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setHelpOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button onClick={() => setHelpOpen(false)} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-6 p-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.title}</h3>
              <ul className="space-y-2">
                {g.items.map(([combo, desc]) => (
                  <li key={combo} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{desc}</span>
                    <Keys combo={combo} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 px-5 py-2.5 text-[11px] text-slate-400">
          Tip: press <kbd className="rounded border border-slate-300 dark:border-slate-600 px-1">?</kbd> anytime to open this.
        </div>
      </div>
    </div>
  )
}
