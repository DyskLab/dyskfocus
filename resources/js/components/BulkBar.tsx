import { Check, Flag, Trash2, X } from 'lucide-react'
import { useSelection } from '../store/selection'
import { useBulkTasks, useProjects, useTags } from '../hooks/queries'
import { useToast } from '../store/toast'

const selectCls =
  'rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-xs outline-none'
const btnCls = 'flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-700'

export default function BulkBar() {
  const selectMode = useSelection((s) => s.selectMode)
  const ids = useSelection((s) => s.ids)
  const clear = useSelection((s) => s.clear)
  const bulk = useBulkTasks()
  const addToast = useToast((s) => s.addToast)
  const projects = useProjects({ status: 'active' })
  const tags = useTags()

  if (!selectMode || ids.size === 0) return null
  const arr = [...ids]

  const run = (action: string, value?: unknown) =>
    bulk.mutate({ ids: arr, action, value }, { onSuccess: () => clear() })

  const del = () =>
    bulk.mutate(
      { ids: arr, action: 'delete' },
      {
        onSuccess: () => {
          addToast({
            message: `${arr.length} deleted`,
            actionLabel: 'Undo',
            onAction: () => bulk.mutate({ ids: arr, action: 'restore' }),
          })
          clear()
        },
      }
    )

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex max-w-full flex-wrap items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-xl">
        <span className="text-xs font-medium text-slate-500">{arr.length} selected</span>
        <button onClick={() => run('complete')} className={btnCls} title="Complete">
          <Check size={14} /> Complete
        </button>
        <button onClick={() => run('flag', true)} className={btnCls} title="Flag">
          <Flag size={14} /> Flag
        </button>
        <select defaultValue="" onChange={(e) => e.target.value && run('priority', e.target.value)} className={selectCls} title="Priority">
          <option value="" disabled>
            Priority…
          </option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">None</option>
        </select>
        <select onChange={(e) => run('project', e.target.value || null)} defaultValue="__" className={selectCls} title="Move to project">
          <option value="__" disabled>
            Move to…
          </option>
          <option value="">Inbox</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select defaultValue="" onChange={(e) => e.target.value && run('tag', e.target.value)} className={selectCls} title="Add tag">
          <option value="" disabled>
            Add tag…
          </option>
          {tags.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button onClick={del} className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:bg-red-950/40" title="Delete" aria-label="Delete">
          <Trash2 size={14} /> Delete
        </button>
        <button onClick={clear} className="rounded p-1 text-slate-400 hover:text-slate-600" title="Cancel" aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
