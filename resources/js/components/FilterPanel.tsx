import { useState } from 'react'
import { Filter, X } from 'lucide-react'
import { DEFAULT_FILTER, isFilterActive, useUI, type TaskFilter } from '../store/ui'

const GROUPS: { key: keyof TaskFilter; label: string; options: { v: string; label: string }[] }[] = [
  {
    key: 'priority',
    label: 'Priority',
    options: [
      { v: 'all', label: 'All' },
      { v: 'high', label: 'High' },
      { v: 'medium', label: 'Medium' },
      { v: 'low', label: 'Low' },
      { v: 'none', label: 'None' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    options: [
      { v: 'any', label: 'Any' },
      { v: 'todo', label: 'Open' },
      { v: 'done', label: 'Completed' },
    ],
  },
  {
    key: 'flagged',
    label: 'Flag',
    options: [
      { v: 'any', label: 'Any' },
      { v: 'yes', label: 'Flagged' },
      { v: 'no', label: 'Unflagged' },
    ],
  },
  {
    key: 'due',
    label: 'Due date',
    options: [
      { v: 'any', label: 'Any' },
      { v: 'overdue', label: 'Overdue' },
      { v: 'today', label: 'Today' },
      { v: 'week', label: 'Next 7 days' },
      { v: 'hasdate', label: 'Has date' },
      { v: 'nodate', label: 'No date' },
    ],
  },
  {
    key: 'deferred',
    label: 'Deferred (start date)',
    options: [
      { v: 'hide', label: 'Hide upcoming' },
      { v: 'show', label: 'Show all' },
      { v: 'only', label: 'Only deferred' },
    ],
  },
]

export default function FilterPanel() {
  const filter = useUI((s) => s.taskFilter)
  const setFilter = useUI((s) => s.setTaskFilter)
  const [open, setOpen] = useState(false)
  const active = isFilterActive(filter)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
          active ? 'border-brand text-brand' : 'border-slate-200 dark:border-slate-700 text-slate-500'
        }`}
        title="Filter tasks"
      >
        <Filter size={14} />
        Filter
        {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-h-[85vh] overflow-hidden rounded-t-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl md:w-full md:max-w-md md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
              {GROUPS.map((g) => (
                <div key={g.key}>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.options.map((o) => (
                      <button
                        key={o.v}
                        onClick={() => setFilter({ ...filter, [g.key]: o.v } as TaskFilter)}
                        className={`rounded-full px-3 py-1 text-xs ${
                          filter[g.key] === o.v
                            ? 'bg-brand text-white'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 hover:bg-slate-200'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3">
              <button
                onClick={() => setFilter(DEFAULT_FILTER)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Clear all
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
