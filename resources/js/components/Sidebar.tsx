import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CalendarClock,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Flag,
  Folder,
  FolderPlus,
  GripVertical,
  Inbox,
  Keyboard,
  LayoutTemplate,
  List,
  LogOut,
  Moon,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Sun,
  Tag as TagIcon,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useUI } from '../store/ui'
import {
  useCounts,
  useCreateFolder,
  useCreateProject,
  useCreateTag,
  useFolders,
  usePerspectives,
  useProjects,
  useTags,
} from '../hooks/queries'
import type { Project } from '../lib/types'
import PerspectiveEditor from './PerspectiveEditor'
import TemplatesModal from './TemplatesModal'
import Logo from './Logo'
import { colorClass } from '../lib/colors'
import { NAV_META } from '../lib/navmeta'
import { showPrompt } from '../store/dialog'

const navItemCls =
  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800'
const activeCls = 'bg-brand/10 !text-brand font-medium'
const menuItemCls =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'

export default function Sidebar({ onNavigate, forceFull = false }: { onNavigate?: () => void; forceFull?: boolean }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useUI()
  const setHelpOpen = useUI((s) => s.setHelpOpen)
  const hidden = useUI((s) => s.hiddenNav)
  const sidebarOpen = useUI((s) => s.sidebarOpen)
  const toggleSidebar = useUI((s) => s.toggleSidebar)
  const mini = !forceFull && !sidebarOpen
  const navigate = useNavigate()

  const projects = useProjects({ status: 'active' })
  const folders = useFolders()
  const tags = useTags()
  const perspectives = usePerspectives()
  const counts = useCounts().data
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  function toggleFolder(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function renderProject(p: Project) {
    return (
      <SortableRow key={p.id} id={`sproj:${p.id}`}>
        {(handle) => (
          <div className="group/row flex items-center gap-0.5">
            <button
              {...handle}
              className="cursor-grab touch-none text-slate-300 opacity-0 group-hover/row:opacity-100"
              title="Drag to reorder" aria-label="Drag to reorder"
            >
              <GripVertical size={12} />
            </button>
            <div className="min-w-0 flex-1">
              <DropZone id={`zone:${p.id}`}>
                <NavLink to={`/project/${p.id}`} className={link} title={p.title}>
                  <span className="truncate">{p.title}</span>
                  {p.flagged && <Flag size={12} className="ml-auto text-amber-500" />}
                  {!!p.remaining_count && <span className="ml-auto text-xs text-slate-400">{p.remaining_count}</span>}
                </NavLink>
              </DropZone>
            </div>
          </div>
        )}
      </SortableRow>
    )
  }

  const createProject = useCreateProject()
  const createFolder = useCreateFolder()
  const createTag = useCreateTag()
  const [perspEditorOpen, setPerspEditorOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  function link({ isActive }: { isActive: boolean }) {
    return `${navItemCls} ${isActive ? activeCls : ''}`
  }

  // --- Mini (collapsed) rail: icon-only nav ---
  if (mini) {
    const items = [
      { to: '/search', icon: Search, label: 'Search', show: true },
      { to: '/inbox', icon: Inbox, label: 'Inbox', badge: counts?.inbox, show: true },
      { to: '/today', icon: Star, label: 'Today', badge: counts?.today, show: true },
      { to: '/forecast', icon: CalendarClock, label: 'Forecast', show: true },
      { to: '/calendar', icon: CalendarDays, label: 'Calendar', show: !hidden.calendar },
      { to: '/flagged', icon: Flag, label: 'Flagged', badge: counts?.flagged, show: !hidden.flagged },
      { to: '/review', icon: RefreshCw, label: 'Review', badge: counts?.review, show: !hidden.review },
      { to: '/completed', icon: CheckCheck, label: 'Completed', show: true },
      { to: '/projects', icon: List, label: 'Projects', show: !hidden.allProjects },
    ].filter((i) => i.show)

    return (
      <aside
        className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3 dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) onNavigate?.()
        }}
      >
        <button
          onClick={toggleSidebar}
          title="Expand sidebar" aria-label="Expand sidebar"
          className="mb-1 rounded-lg p-1.5 hover:bg-slate-200/60 dark:hover:bg-slate-800"
        >
          <Logo size={22} />
        </button>
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            title={n.label}
            className={({ isActive }) =>
              `relative rounded-lg p-2 ${
                isActive ? 'bg-brand/10 text-brand' : 'text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`
            }
          >
            <n.icon size={18} />
            {!!n.badge && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" />}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col items-center gap-2">
          <button
            onClick={toggleSidebar}
            title="Expand sidebar" aria-label="Expand sidebar"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <PanelLeftOpen size={18} />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) onNavigate?.()
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <Logo size={22} />
        <span className="font-semibold">DyskFocus</span>
        {!forceFull && (
          <button
            onClick={toggleSidebar}
            title="Collapse sidebar" aria-label="Collapse sidebar"
            className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-brand dark:hover:bg-slate-800"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
        <div className="space-y-0.5">
          <NavLink to="/search" className={link} title={NAV_META.search.desc}>
            <Search size={16} /> Search
          </NavLink>
          <DropZone id="zone:inbox">
            <NavLink to="/inbox" className={link} title={NAV_META.inbox.desc}>
              <Inbox size={16} /> Inbox
              <NavBadge n={counts?.inbox} />
            </NavLink>
          </DropZone>
          <NavLink to="/today" className={link} title={NAV_META.today.desc}>
            <Star size={16} /> Today
            <NavBadge n={counts?.today} danger={!!counts?.overdue} />
          </NavLink>
          <NavLink to="/forecast" className={link} title={NAV_META.forecast.desc}>
            <CalendarClock size={16} /> Forecast
          </NavLink>
          {!hidden.calendar && (
            <NavLink to="/calendar" className={link} title={NAV_META.calendar.desc}>
              <CalendarDays size={16} /> Calendar
            </NavLink>
          )}
          {!hidden.flagged && (
            <NavLink to="/flagged" className={link} title={NAV_META.flagged.desc}>
              <Flag size={16} /> Flagged
              <NavBadge n={counts?.flagged} />
            </NavLink>
          )}
          {!hidden.review && (
            <NavLink to="/review" className={link} title={NAV_META.review.desc}>
              <RefreshCw size={16} /> Review
              <NavBadge n={counts?.review} />
            </NavLink>
          )}
          <NavLink to="/completed" className={link} title={NAV_META.completed.desc}>
            <CheckCheck size={16} /> Completed
          </NavLink>
        </div>

        <Section
          title="Projects"
          onAdd={async () => {
            const title = await showPrompt({ title: 'New project', label: 'Project name', confirmText: 'Create' })
            if (title) createProject.mutate({ title })
          }}
          extra={
            <>
              {!hidden.allProjects && (
                <NavLink
                  to="/projects"
                  title={NAV_META.allProjects.desc}
                  className={({ isActive }) => `text-slate-400 hover:text-brand ${isActive ? '!text-brand' : ''}`}
                >
                  <List size={14} />
                </NavLink>
              )}
              <button
                title="Project templates" aria-label="Project templates"
                onClick={() => setTemplatesOpen(true)}
                className="text-slate-400 hover:text-brand"
              >
                <LayoutTemplate size={14} />
              </button>
              <button
                title="New folder" aria-label="New folder"
                onClick={async () => {
                  const name = await showPrompt({ title: 'New folder', label: 'Folder name', confirmText: 'Create' })
                  if (name) createFolder.mutate(name)
                }}
                className="text-slate-400 hover:text-brand"
              >
                <FolderPlus size={14} />
              </button>
            </>
          }
        >
          {!hidden.byProject && (
            <NavLink to="/by-project" className={link} title={NAV_META.byProject.desc}>
              <span className="text-slate-400">By project</span>
            </NavLink>
          )}
          {(() => {
            const top = projects.data?.filter((p) => p.folder_id == null) ?? []
            return (
              <SortableContext items={top.map((p) => `sproj:${p.id}`)} strategy={verticalListSortingStrategy}>
                {top.map(renderProject)}
              </SortableContext>
            )
          })()}
          <SortableContext
            items={(folders.data ?? []).map((f) => `sfold:${f.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {folders.data?.map((folder) => {
              const inFolder = projects.data?.filter((p) => p.folder_id === folder.id) ?? []
              const isCollapsed = collapsed.has(folder.id)
              return (
                <SortableRow key={folder.id} id={`sfold:${folder.id}`}>
                  {(handle) => (
                    <div>
                      <div className="group/folder flex items-center gap-0.5">
                        <button
                          {...handle}
                          className="cursor-grab touch-none text-slate-300 opacity-0 group-hover/folder:opacity-100"
                          title="Drag folder" aria-label="Drag folder"
                        >
                          <GripVertical size={12} />
                        </button>
                        <button
                          onClick={() => toggleFolder(folder.id)}
                          className="rounded p-1 text-slate-400 hover:text-brand"
                          title={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        </button>
                        <NavLink
                          to={`/folder/${folder.id}`}
                          className={(s) => `${link(s)} min-w-0 flex-1`}
                          title={folder.name}
                        >
                          <Folder size={13} /> <span className="truncate">{folder.name}</span>
                          {!!inFolder.length && (
                            <span className="ml-auto text-[10px] text-slate-400">{inFolder.length}</span>
                          )}
                        </NavLink>
                      </div>
                      {!isCollapsed && (
                        <div className="ml-2 space-y-0.5">
                          <SortableContext
                            items={inFolder.map((p) => `sproj:${p.id}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            {inFolder.map(renderProject)}
                          </SortableContext>
                        </div>
                      )}
                    </div>
                  )}
                </SortableRow>
              )
            })}
          </SortableContext>
        </Section>

        {!hidden.tags && (
        <Section
          title="Tags"
          titleHint={NAV_META.tags.desc}
          onAdd={async () => {
            const name = await showPrompt({ title: 'New tag', label: 'Tag name', confirmText: 'Create' })
            if (name) createTag.mutate(name)
          }}
        >
          {tags.data?.map((t) => (
            <NavLink key={t.id} to={`/tag/${t.id}`} className={link} title={t.name}>
              {colorClass(t.color) ? (
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorClass(t.color)}`} />
              ) : (
                <TagIcon size={14} />
              )}{' '}
              <span className="truncate">{t.name}</span>
              {!!t.tasks_count && <span className="ml-auto text-xs text-slate-400">{t.tasks_count}</span>}
            </NavLink>
          ))}
        </Section>
        )}

        {!hidden.perspectives && (
        <Section title="Perspectives" titleHint={NAV_META.perspectives.desc} onAdd={() => setPerspEditorOpen(true)}>
          {perspectives.data?.map((p) => (
            <NavLink key={p.id} to={`/perspective/${p.id}`} className={link} title={p.name}>
              <Star size={14} /> <span className="truncate">{p.name}</span>
            </NavLink>
          ))}
        </Section>
        )}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white text-xs font-semibold">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user?.name}</div>
            <div className="truncate text-xs text-slate-400">{user?.email}</div>
          </div>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded p-1.5 text-slate-400 hover:text-brand"
              title="Menu"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-full right-0 z-20 mb-2 w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 text-sm shadow-lg">
                  <button
                    onClick={() => {
                      setHelpOpen(true)
                      setMenuOpen(false)
                    }}
                    className={menuItemCls}
                  >
                    <Keyboard size={14} /> Keyboard shortcuts
                  </button>
                  <button onClick={() => toggleTheme()} className={menuItemCls}>
                    {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                    {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </button>
                  <button
                    onClick={() => {
                      navigate('/settings')
                      onNavigate?.()
                      setMenuOpen(false)
                    }}
                    className={menuItemCls}
                  >
                    <Settings size={14} /> Settings
                  </button>
                  <button onClick={() => logout()} className={`${menuItemCls} text-red-500`}>
                    <LogOut size={14} /> Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {perspEditorOpen && <PerspectiveEditor onClose={() => setPerspEditorOpen(false)} />}
      {templatesOpen && <TemplatesModal onClose={() => setTemplatesOpen(false)} />}
    </aside>
  )
}

function NavBadge({ n, danger = false }: { n?: number; danger?: boolean }) {
  if (!n) return null
  return (
    <span
      className={`ml-auto rounded-full px-1.5 text-xs tabular-nums ${
        danger ? 'bg-red-500 text-white' : 'text-slate-400'
      }`}
    >
      {n}
    </span>
  )
}

function DropZone({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-colors ${
        isOver ? 'bg-brand/15 ring-1 ring-inset ring-brand' : ''
      }`}
    >
      {children}
    </div>
  )
}

// A draggable sidebar row. The drag handle props are passed to the render-prop
// child so only the grip (not the whole row/link) initiates the drag.
function SortableRow({
  id,
  children,
}: {
  id: string
  children: (handle: Record<string, unknown>) => ReactNode
}) {
  const { setNodeRef, transform, transition, listeners, attributes, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

function Section({
  title,
  titleHint,
  onAdd,
  extra,
  children,
}: {
  title: string
  titleHint?: string
  onAdd: () => void
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400" title={titleHint}>
          {title}
        </span>
        <div className="flex items-center gap-1">
          {extra}
          <button onClick={onAdd} className="text-slate-400 hover:text-brand" title={`Add ${title}`} aria-label={`Add ${title}`}>
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}
