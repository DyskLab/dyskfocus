import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { Flag, Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import Inspector from './Inspector'
import Logo from './Logo'
import ShortcutsHelp from './ShortcutsHelp'
import Toaster from './Toaster'
import BulkBar from './BulkBar'
import DialogHost from './DialogHost'
import { PageSkeleton } from './Skeleton'
import { useUI } from '../store/ui'
import { useDnd } from '../store/dnd'
import { useFolders, useProjects, useReorderFolders, useReorderProjects, useUpdateTask } from '../hooks/queries'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useDueReminders } from '../hooks/useDueReminders'
import { useRealtimeSync } from '../hooks/useRealtimeSync'
import { isDesktop } from '../lib/env'
import type { Task } from '../lib/types'

// Prefer pointer-based hits (so sidebar drop-zones register), fall back to
// closest-center for smooth in-list sorting. Candidate droppables are scoped to
// what's being dragged so, e.g., reordering a project never resolves onto a
// task drop-zone (and vice-versa).
const collision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  const kind = activeId.startsWith('sproj:') ? 'sproj:' : activeId.startsWith('sfold:') ? 'sfold:' : null
  const droppableContainers = args.droppableContainers.filter((c) => {
    const cid = String(c.id)
    if (kind) return cid.startsWith(kind) // sidebar sorting: only same-kind rows
    return !cid.startsWith('sproj:') && !cid.startsWith('sfold:') // task drag: zones + tasks
  })
  const scoped = { ...args, droppableContainers }
  const pointer = pointerWithin(scoped)
  return pointer.length ? pointer : closestCenter(scoped)
}

const ZONE = 'zone:'

export default function Layout() {
  const selectedTaskId = useUI((s) => s.selectedTaskId)
  const helpOpen = useUI((s) => s.helpOpen)
  const move = useUpdateTask()
  const projectsQuery = useProjects({ status: 'active' })
  const foldersQuery = useFolders()
  const reorderProjects = useReorderProjects()
  const reorderFolders = useReorderFolders()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [dragging, setDragging] = useState<Task | null>(null)
  const [mobileNav, setMobileNav] = useState(false)

  useKeyboardShortcuts()
  useDueReminders()
  // SSE ties up the single desktop PHP process; skip it in the bundled app.
  useRealtimeSync(!isDesktop)

  function findTask(id: number): Task | null {
    for (const g of Object.values(useDnd.getState().groups)) {
      const t = g.tasks.find((x) => x.id === id)
      if (t) return t
    }
    return null
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(findTask(Number(event.active.id)))
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null)
    const { active, over } = event
    if (!over) return

    // Sidebar reordering (projects / folders). Ids are prefixed sproj:/sfold:.
    const aStr = String(active.id)
    const oStr = String(over.id)
    if (aStr.startsWith('sproj:') && oStr.startsWith('sproj:')) {
      const aId = Number(aStr.slice(6))
      const oId = Number(oStr.slice(6))
      const active_ = projectsQuery.data?.find((p) => p.id === aId)
      if (!active_ || aId === oId) return
      const groupFolder = active_.folder_id ?? null
      const ids = (projectsQuery.data ?? [])
        .filter((p) => (p.folder_id ?? null) === groupFolder)
        .map((p) => p.id)
      const from = ids.indexOf(aId)
      const to = ids.indexOf(oId)
      if (from < 0 || to < 0 || from === to) return
      reorderProjects.mutate(arrayMove(ids, from, to))
      return
    }
    if (aStr.startsWith('sfold:') && oStr.startsWith('sfold:')) {
      const aId = Number(aStr.slice(6))
      const oId = Number(oStr.slice(6))
      const ids = (foldersQuery.data ?? []).map((f) => f.id)
      const from = ids.indexOf(aId)
      const to = ids.indexOf(oId)
      if (from < 0 || to < 0 || from === to) return
      reorderFolders.mutate(arrayMove(ids, from, to))
      return
    }

    const activeId = Number(active.id)
    const overId = over.id

    // Dropped on a sidebar zone → move to that project (or Inbox), promoting
    // a subtask to a top-level task.
    if (typeof overId === 'string' && overId.startsWith(ZONE)) {
      const target = overId.slice(ZONE.length)
      const projectId = target === 'inbox' ? null : Number(target)
      const task = findTask(activeId)
      if (task && task.project_id === projectId && task.parent_id == null) return
      move.mutate({ id: activeId, project_id: projectId, parent_id: null })
      return
    }

    // Dropped on another task → reorder within the group both belong to.
    if (typeof overId === 'number') {
      for (const g of Object.values(useDnd.getState().groups)) {
        const ids = g.tasks.map((t) => t.id)
        if (ids.includes(activeId) && ids.includes(overId)) {
          const oldIndex = ids.indexOf(activeId)
          const newIndex = ids.indexOf(overId)
          if (oldIndex !== newIndex) g.reorder(arrayMove(ids, oldIndex, newIndex))
          return
        }
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex h-full overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Mobile sidebar drawer */}
        {mobileNav && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
            <div className="absolute left-0 top-0 h-full shadow-xl">
              <Sidebar onNavigate={() => setMobileNav(false)} forceFull />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 md:hidden">
            <button
              onClick={() => setMobileNav(true)}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <Logo size={20} />
            <span className="font-semibold">DyskFocus</span>
          </div>

          <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>

        {selectedTaskId != null && <Inspector key={selectedTaskId} />}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="flex items-center gap-2 rounded-lg border border-brand/50 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-xl">
            {dragging.flagged && <Flag size={13} className="text-amber-500" />}
            <span className="max-w-xs truncate">{dragging.title}</span>
          </div>
        ) : null}
      </DragOverlay>

      {helpOpen && <ShortcutsHelp />}
      <BulkBar />
      <Toaster />
      <DialogHost />
    </DndContext>
  )
}
