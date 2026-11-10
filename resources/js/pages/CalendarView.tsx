import { useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Task } from '../lib/types'
import { PRIORITY_META } from '../lib/priority'
import QuickAdd from '../components/QuickAdd'
import { useCreateTask, useTasks, useUpdateTask } from '../hooks/queries'
import { useUI } from '../store/ui'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Chip({ task, onOpen }: { task: Task; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`Open task: ${task.title}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(task.id)
      }}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`flex cursor-grab items-center gap-1 truncate rounded px-1 text-[11px] ${
        task.status === 'done'
          ? 'text-slate-400 line-through'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {task.priority !== 'none' && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_META[task.priority].dot}`} />}
      <span className="truncate">{task.title}</span>
    </div>
  )
}

function DayCell({
  day,
  month,
  dayTasks,
  selected,
  onSelect,
  onOpenTask,
}: {
  day: Date
  month: Date
  dayTasks: Task[]
  selected: boolean
  onSelect: (d: Date) => void
  onOpenTask: (id: number) => void
}) {
  const key = format(day, 'yyyy-MM-dd')
  const { setNodeRef, isOver } = useDroppable({ id: `cal:${key}` })
  const inMonth = isSameMonth(day, month)

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${format(day, 'EEEE, d MMMM yyyy')}${dayTasks.length ? `, ${dayTasks.length} task${dayTasks.length > 1 ? 's' : ''}` : ''}`}
      onClick={() => onSelect(day)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return // keys on a chip belong to the chip
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(day)
        }
      }}
      className={`min-h-[64px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand cursor-pointer border-b border-r border-slate-100 dark:border-slate-800 p-1.5 align-top last:border-r-0 sm:min-h-[84px] ${
        inMonth ? '' : 'bg-slate-50/60 dark:bg-slate-950/40'
      } ${selected ? 'ring-2 ring-inset ring-brand' : ''} ${isOver ? 'bg-brand/10' : ''}`}
    >
      <div
        className={`text-xs ${inMonth ? '' : 'text-slate-400'} ${
          isToday(day) ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand font-medium text-white' : ''
        }`}
      >
        {format(day, 'd')}
      </div>
      <div className="mt-1 space-y-0.5">
        {dayTasks.slice(0, 3).map((t) => (
          <Chip key={t.id} task={t} onOpen={onOpenTask} />
        ))}
        {dayTasks.length > 3 && <div className="text-[10px] text-slate-400">+{dayTasks.length - 3} more</div>}
      </div>
    </div>
  )
}

export default function CalendarView() {
  const setSelectedTask = useUI((s) => s.setSelectedTask)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const [dragTask, setDragTask] = useState<Task | null>(null)

  const update = useUpdateTask()
  const createTask = useCreateTask()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const gridStart = startOfWeek(startOfMonth(month))
  const gridEnd = endOfWeek(endOfMonth(month))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const { data: tasks } = useTasks({
    due_after: format(gridStart, 'yyyy-MM-dd'),
    due_before: format(gridEnd, 'yyyy-MM-dd'),
  })

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks ?? []) {
      if (!t.due_date) continue
      const list = map.get(t.due_date) ?? []
      list.push(t)
      map.set(t.due_date, list)
    }
    return map
  }, [tasks])

  const selectedKey = format(selectedDay, 'yyyy-MM-dd')
  const selectedTasks = byDay.get(selectedKey) ?? []

  function onDragStart(e: DragStartEvent) {
    setDragTask(tasks?.find((t) => t.id === Number(e.active.id)) ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    setDragTask(null)
    const { active, over } = e
    if (!over) return
    const overId = String(over.id)
    if (!overId.startsWith('cal:')) return
    const date = overId.slice(4)
    const task = tasks?.find((t) => t.id === Number(active.id))
    if (task && task.due_date !== date) {
      update.mutate({ id: Number(active.id), due_date: date })
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
      <header className="mb-4 flex items-center gap-2">
        <CalendarDays className="text-brand" />
        <h1 className="flex-1 truncate text-lg font-semibold">{format(month, 'MMMM yyyy')}</h1>
        <button
          onClick={() => {
            setMonth(startOfMonth(new Date()))
            setSelectedDay(new Date())
          }}
          className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs text-slate-500 hover:border-brand hover:text-brand"
        >
          Today
        </button>
        <button onClick={() => setMonth(subMonths(month, 1))} className="rounded p-1.5 text-slate-400 hover:text-brand" aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => setMonth(addMonths(month, 1))} className="rounded p-1.5 text-slate-400 hover:text-brand" aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </header>

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => (
              <DayCell
                key={format(day, 'yyyy-MM-dd')}
                day={day}
                month={month}
                dayTasks={byDay.get(format(day, 'yyyy-MM-dd')) ?? []}
                selected={isSameDay(day, selectedDay)}
                onSelect={setSelectedDay}
                onOpenTask={setSelectedTask}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragTask ? (
            <div className="rounded border border-brand/50 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] shadow-lg">
              {dragTask.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="mt-4">
        <h2 className="mb-2 text-sm font-semibold">{format(selectedDay, 'EEEE, MMMM d')}</h2>
        <div className="mb-2">
          <QuickAdd
            onAdd={(p) => createTask.mutate({ ...p, due_date: p.due_date ?? selectedKey })}
            placeholder={`Add a task due ${format(selectedDay, 'MMM d')}…`}
          />
        </div>
        {selectedTasks.length === 0 ? (
          <p className="px-1 py-4 text-sm text-slate-400">No tasks due on this day.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            {selectedTasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTask(t.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  {t.priority !== 'none' && <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_META[t.priority].dot}`} />}
                  <span className={t.status === 'done' ? 'text-slate-400 line-through' : ''}>{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
