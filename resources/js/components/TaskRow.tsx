import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, isPast, isToday, parseISO } from 'date-fns'
import { Check, Clock, Flag, GripVertical, Trash2 } from 'lucide-react'
import type { Task } from '../lib/types'
import { PRIORITY_META } from '../lib/priority'
import { colorClass } from '../lib/colors'
import { useCompleteTask, useDeleteTask, useRestoreTask, useUpdateTask } from '../hooks/queries'
import { useUI } from '../store/ui'
import { useToast } from '../store/toast'
import { useSelection } from '../store/selection'

const SWIPE_TRIGGER = 72
const SWIPE_MAX = 110

export default function TaskRow({
  task,
  draggable = true,
  indent = false,
}: {
  task: Task
  draggable?: boolean
  indent?: boolean
}) {
  const sortable = useSortable({ id: task.id, disabled: !draggable })
  const complete = useCompleteTask()
  const update = useUpdateTask()
  const del = useDeleteTask()
  const restore = useRestoreTask()
  const addToast = useToast((s) => s.addToast)
  const setSelectedTask = useUI((s) => s.setSelectedTask)
  const selectedTaskId = useUI((s) => s.selectedTaskId)
  const selectMode = useSelection((s) => s.selectMode)
  const isChecked = useSelection((s) => s.ids.has(task.id))
  const toggleSelect = useSelection((s) => s.toggle)

  const done = task.status === 'done'
  const due = task.due_date ? parseISO(task.due_date) : null
  const defer = task.defer_date ? parseISO(task.defer_date) : null
  const deferred = !done && !!task.defer_date && task.defer_date > format(new Date(), 'yyyy-MM-dd')
  const selected = selectedTaskId === task.id

  // --- swipe (touch only) ---
  const [dx, setDx] = useState(0)
  const start = useRef({ x: 0, y: 0 })
  const curDx = useRef(0)
  const active = useRef(false)

  function onTouchStart(e: React.TouchEvent) {
    if (sortable.isDragging || selectMode) return
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    curDx.current = 0
    active.current = false
  }
  function onTouchMove(e: React.TouchEvent) {
    const dX = e.touches[0].clientX - start.current.x
    const dY = e.touches[0].clientY - start.current.y
    if (!active.current) {
      if (Math.abs(dX) > 12 && Math.abs(dX) > Math.abs(dY)) active.current = true
      else return
    }
    curDx.current = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, dX))
    setDx(curDx.current)
  }
  function onTouchEnd() {
    const d = curDx.current
    if (d > SWIPE_TRIGGER) {
      complete.mutate({ id: task.id, completed: !done })
    } else if (d < -SWIPE_TRIGGER) {
      del.mutate(task.id)
      addToast({ message: 'Task deleted', actionLabel: 'Undo', onAction: () => restore.mutate(task.id) })
    }
    curDx.current = 0
    setDx(0)
    active.current = false
  }

  const sortableStyle = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  }

  const dueClass =
    due && isPast(due) && !isToday(due) && !done
      ? 'text-red-500'
      : due && isToday(due)
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-400'

  return (
    <div
      ref={sortable.setNodeRef}
      style={sortableStyle}
      className="relative overflow-hidden border-b border-slate-100 dark:border-slate-800"
    >
      {/* swipe action reveals — only visible while actively swiping */}
      {dx > 0 && (
        <div className="absolute inset-y-0 left-0 flex items-center bg-green-500 px-4 text-white">
          <Check size={18} />
        </div>
      )}
      {dx < 0 && (
        <div className="absolute inset-y-0 right-0 flex items-center bg-red-500 px-4 text-white">
          <Trash2 size={18} />
        </div>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 0.2s' : 'none' }}
        className={`group relative flex items-center gap-2 px-3 py-2 ${indent ? 'pl-9' : ''} ${
          isChecked
            ? 'bg-brand/10'
            : selected
              ? 'bg-brand/5'
              : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50'
        }`}
      >
        {draggable && (
          <button
            {...sortable.listeners}
            {...sortable.attributes}
            className="cursor-grab text-slate-300 opacity-40 group-hover:opacity-100"
            title="Drag" aria-label="Drag"
          >
            <GripVertical size={14} />
          </button>
        )}

        {colorClass(task.color) && <span className={`h-5 w-1 shrink-0 rounded-full ${colorClass(task.color)}`} />}

        {task.priority !== 'none' && (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_META[task.priority].dot}`}
            title={PRIORITY_META[task.priority].label}
          />
        )}

        {selectMode ? (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleSelect(task.id)}
            className="h-4 w-4 shrink-0 cursor-pointer accent-indigo-500"
          />
        ) : (
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => complete.mutate({ id: task.id, completed: e.target.checked })}
            className="h-4 w-4 shrink-0 cursor-pointer"
          />
        )}

        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={() => (selectMode ? toggleSelect(task.id) : setSelectedTask(task.id))}
        >
          <span className={`text-sm ${done ? 'text-slate-400 line-through' : ''}`}>{task.title}</span>
          {due && <span className={`ml-2 text-xs ${dueClass}`}>{format(due, 'MMM d')}</span>}
          {deferred && defer && (
            <span
              className="ml-2 inline-flex items-center gap-0.5 align-middle text-xs text-indigo-500 dark:text-indigo-400"
              title={`Deferred — starts ${format(defer, 'MMM d, yyyy')}`}
            >
              <Clock size={11} /> {format(defer, 'MMM d')}
            </span>
          )}
          {task.tags?.map((t) => (
            <span
              key={t.id}
              className="ml-1.5 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800"
            >
              {colorClass(t.color) && <span className={`h-1.5 w-1.5 rounded-full ${colorClass(t.color)}`} />}
              {t.name}
            </span>
          ))}
        </div>

        <button
          onClick={() => update.mutate({ id: task.id, flagged: !task.flagged })}
          className={`shrink-0 rounded p-1 ${
            task.flagged ? 'text-amber-500' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-amber-500'
          }`}
          title="Flag"
        >
          <Flag size={15} fill={task.flagged ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
}
