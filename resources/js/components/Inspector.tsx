import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Eye, Flag, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useUI } from '../store/ui'
import {
  useAddComment,
  useCompleteTask,
  useCreateTask,
  useDeleteComment,
  useDeleteTask,
  useRestoreTask,
  useTags,
  useTask,
  useUpdateTask,
} from '../hooks/queries'
import { useToast } from '../store/toast'
import { MarkdownEditor, MarkdownView } from './Markdown'
import { PRIORITIES, PRIORITY_META } from '../lib/priority'
import { colorClass } from '../lib/colors'
import ColorPicker from './ColorPicker'

const FREQ_LABEL: Record<string, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }

export default function Inspector() {
  const selectedTaskId = useUI((s) => s.selectedTaskId)
  const setSelectedTask = useUI((s) => s.setSelectedTask)
  const { data: task, isLoading } = useTask(selectedTaskId)
  const allTags = useTags()
  const update = useUpdateTask()
  const del = useDeleteTask()
  const restore = useRestoreTask()
  const complete = useCompleteTask()
  const createTask = useCreateTask()
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()
  const addToast = useToast((s) => s.addToast)

  // Open a task straight into edit mode; the eye button switches to read-only view.
  // (Inspector is remounted per task via key={selectedTaskId}, so this resets each open.)
  const [mode, setMode] = useState<'view' | 'edit'>('edit')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [comment, setComment] = useState('')
  const [subtitle, setSubtitle] = useState('')
  // Which task the title/note state was filled from (state, so it updates in the same render).
  const [hydratedFor, setHydratedFor] = useState<number | null>(null)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setNote(task.note ?? '')
      setHydratedFor(task.id)
    }
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Closing the Inspector (Esc, X, picking another task) must not silently
  // drop an edited note/title — flush unsaved edits on unmount.
  const draft = useRef({ id: selectedTaskId, loaded: false, title: '', note: '', origTitle: '', origNote: '' })
  draft.current = {
    id: selectedTaskId,
    loaded: !!task && hydratedFor === task.id,
    title,
    note,
    origTitle: task?.title ?? '',
    origNote: task?.note ?? '',
  }
  const mutateRef = useRef(update.mutate)
  mutateRef.current = update.mutate
  useEffect(
    () => () => {
      const d = draft.current
      if (!d.id || !d.loaded) return
      const patch: Record<string, unknown> = {}
      if (d.note !== d.origNote) patch.note = d.note
      if (d.title.trim() && d.title !== d.origTitle) patch.title = d.title
      if (Object.keys(patch).length) mutateRef.current({ id: d.id, ...patch })
    },
    [],
  )

  if (!selectedTaskId) return null

  const tagIds = new Set(task?.tags?.map((t) => t.id) ?? [])
  const repeat =
    (task?.repeat_rule as {
      frequency?: string
      interval?: number
      ends?: string
      count?: number
      until?: string
    } | null) ?? null
  const repeatEnd =
    repeat?.ends === 'after'
      ? ` · ${repeat.count ?? 1}×`
      : repeat?.ends === 'on' && repeat.until
        ? ` · until ${repeat.until}`
        : ''
  const repeatLabel = repeat?.frequency
    ? `Every ${repeat.interval ?? 1} ${FREQ_LABEL[repeat.frequency] ?? repeat.frequency}${(repeat.interval ?? 1) > 1 ? 's' : ''}${repeatEnd}`
    : 'Never'

  function save(patch: Record<string, unknown>) {
    if (selectedTaskId) update.mutate({ id: selectedTaskId, ...patch })
  }

  function setRepeat(patch: Record<string, unknown>) {
    const cur = (task?.repeat_rule as Record<string, unknown> | null) ?? {}
    const next = { ...cur, ...patch }
    save({ repeat_rule: next.frequency ? next : null })
  }

  function toggleTag(id: number) {
    const next = new Set(tagIds)
    next.has(id) ? next.delete(id) : next.add(id)
    save({ tag_ids: [...next] })
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSelectedTask(null)} />
      <aside className="fixed inset-x-0 bottom-0 z-40 flex max-h-[88vh] flex-col overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:static md:inset-auto md:z-auto md:h-full md:max-h-none md:w-96 md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-700 md:hidden" />
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <span className="text-sm font-semibold">{mode === 'edit' ? 'Edit task' : 'Task details'}</span>
        <div className="flex items-center gap-1">
          {mode === 'view' ? (
            <button
              onClick={() => setMode('edit')}
              className="rounded p-1.5 text-slate-400 hover:text-brand"
              title="Edit"
            >
              <Pencil size={16} />
            </button>
          ) : (
            <button
              onClick={() => setMode('view')}
              className="rounded p-1.5 text-slate-400 hover:text-brand"
              title="View"
            >
              <Eye size={16} />
            </button>
          )}
          <button
            onClick={() => task && save({ flagged: !task.flagged })}
            className={`rounded p-1.5 ${task?.flagged ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
            title="Flag"
          >
            <Flag size={16} fill={task?.flagged ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => {
              if (!selectedTaskId) return
              const id = selectedTaskId
              del.mutate(id)
              setSelectedTask(null)
              addToast({ message: 'Task deleted', actionLabel: 'Undo', onAction: () => restore.mutate(id) })
            }}
            className="rounded p-1.5 text-slate-400 hover:text-red-500"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
          <button onClick={() => setSelectedTask(null)} className="rounded p-1.5 text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {isLoading || !task ? (
        <div className="p-4 text-sm text-slate-400">Loading…</div>
      ) : mode === 'view' ? (
        /* ---------------- VIEW (read-only) ---------------- */
        <div className="space-y-5 p-4">
          <h2 className="text-base font-medium">{task.title}</h2>

          {task.note?.trim() && (
            <Group label="Note">
              <MarkdownView content={task.note} />
            </Group>
          )}

          {task.children && task.children.length > 0 && (
            <Group label={`Subtasks (${task.children.length})`}>
              <div className="space-y-1">
                {task.children.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c.status === 'done'}
                      onChange={(e) => complete.mutate({ id: c.id, completed: e.target.checked })}
                      className="h-4 w-4 shrink-0 cursor-pointer"
                    />
                    <span
                      onClick={() => setSelectedTask(c.id)}
                      className={`flex-1 cursor-pointer truncate text-sm ${
                        c.status === 'done' ? 'text-slate-400 line-through' : ''
                      }`}
                    >
                      {c.title}
                    </span>
                  </div>
                ))}
              </div>
            </Group>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Group label="Defer date">
              <p className="text-sm">{task.defer_date ? format(parseISO(task.defer_date), 'MMM d, yyyy') : '—'}</p>
            </Group>
            <Group label="Due date">
              <p className="text-sm">{task.due_date ? format(parseISO(task.due_date), 'MMM d, yyyy') : '—'}</p>
            </Group>
          </div>

          <Group label="Priority">
            <div className="flex items-center gap-2 text-sm">
              {task.priority !== 'none' && <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_META[task.priority].dot}`} />}
              {PRIORITY_META[task.priority].label}
            </div>
          </Group>

          {colorClass(task.color) && (
            <Group label="Color">
              <span className={`inline-block h-4 w-4 rounded-full ${colorClass(task.color)}`} />
            </Group>
          )}

          <Group label="Repeat">
            <p className="text-sm">{repeatLabel}</p>
          </Group>

          {task.tags && task.tags.length > 0 && (
            <Group label="Tags">
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {colorClass(t.color) && <span className={`h-1.5 w-1.5 rounded-full ${colorClass(t.color)}`} />}
                    {t.name}
                  </span>
                ))}
              </div>
            </Group>
          )}

          {task.estimated_minutes != null && (
            <Group label="Estimated">
              <p className="text-sm">{task.estimated_minutes} min</p>
            </Group>
          )}

          <Group label={`Comments (${task.comments?.length ?? 0})`}>
            {task.comments?.length ? (
              <div className="space-y-3">
                {task.comments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">
                      {c.body}
                    </p>
                    <div className="mt-1 text-[11px] text-slate-400">{format(parseISO(c.created_at), 'MMM d, HH:mm')}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No comments.</p>
            )}
          </Group>
        </div>
      ) : (
        /* ---------------- EDIT ---------------- */
        <div className="space-y-5 p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && save({ title })}
            className="w-full bg-transparent text-base font-medium outline-none"
          />

          <Group label="Note (Markdown)">
            <MarkdownEditor value={note} onChange={setNote} placeholder="Write notes in Markdown…" />
            {note !== (task.note ?? '') && (
              <button
                onClick={() => save({ note })}
                className="mt-2 rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Save note
              </button>
            )}
          </Group>

          <Group label={`Subtasks (${task.children?.length ?? 0})`}>
            <div className="space-y-1">
              {task.children?.map((c) => (
                <div key={c.id} className="group/sub flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.status === 'done'}
                    onChange={(e) => complete.mutate({ id: c.id, completed: e.target.checked })}
                    className="h-4 w-4 shrink-0 cursor-pointer"
                  />
                  <span
                    onClick={() => setSelectedTask(c.id)}
                    className={`flex-1 cursor-pointer truncate text-sm ${
                      c.status === 'done' ? 'text-slate-400 line-through' : ''
                    }`}
                  >
                    {c.title}
                  </span>
                  <button
                    onClick={() => {
                      del.mutate(c.id)
                      addToast({
                        message: 'Subtask deleted',
                        actionLabel: 'Undo',
                        onAction: () => restore.mutate(c.id),
                      })
                    }}
                    className="shrink-0 text-slate-300 opacity-0 group-hover/sub:opacity-100 hover:text-red-500"
                    title="Delete subtask"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const t = subtitle.trim()
                  if (!t || !selectedTaskId) return
                  createTask.mutate({ title: t, parent_id: selectedTaskId, project_id: task.project_id })
                  setSubtitle('')
                }}
                className="flex items-center gap-2 pt-1"
              >
                <Plus size={14} className="text-slate-400" />
                <input
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Add subtask…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </form>
            </div>
          </Group>

          <div className="grid grid-cols-2 gap-3">
            <Group label="Defer date">
              <input
                type="date"
                value={task.defer_date ?? ''}
                onChange={(e) => save({ defer_date: e.target.value || null })}
                className={dateCls}
              />
            </Group>
            <Group label="Due date">
              <input
                type="date"
                value={task.due_date ?? ''}
                onChange={(e) => save({ due_date: e.target.value || null })}
                className={dateCls}
              />
            </Group>
          </div>

          <Group label="Priority">
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => save({ priority: p })}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                    task.priority === p
                      ? 'bg-brand text-white'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {p !== 'none' && (
                    <span className={`h-2 w-2 rounded-full ${task.priority === p ? 'bg-white' : PRIORITY_META[p].dot}`} />
                  )}
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </Group>

          <Group label="Color">
            <ColorPicker value={task.color} onChange={(c) => save({ color: c })} />
          </Group>

          <Group label="Repeat">
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={repeat?.frequency ?? ''}
                  onChange={(e) => {
                    const f = e.target.value
                    if (!f) return save({ repeat_rule: null })
                    setRepeat({ frequency: f, interval: repeat?.interval ?? 1 })
                  }}
                  className={dateCls}
                >
                  <option value="">Never</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
                {repeat?.frequency && (
                  <input
                    type="number"
                    min={1}
                    defaultValue={repeat.interval ?? 1}
                    onBlur={(e) => setRepeat({ interval: Math.max(1, Number(e.target.value) || 1) })}
                    className={`${dateCls} w-20`}
                    title="Every N periods"
                  />
                )}
              </div>

              {repeat?.frequency && (
                <div className="flex gap-2">
                  <select
                    value={repeat?.ends ?? 'never'}
                    onChange={(e) => {
                      const ends = e.target.value
                      const patch: Record<string, unknown> = { ends }
                      if (ends === 'never') {
                        patch.count = undefined
                        patch.until = undefined
                      }
                      if (ends === 'after' && !repeat?.count) patch.count = 5
                      setRepeat(patch)
                    }}
                    className={dateCls}
                    title="When the repeat stops"
                  >
                    <option value="never">Ends: Never</option>
                    <option value="after">Ends: After…</option>
                    <option value="on">Ends: On date</option>
                  </select>
                  {repeat?.ends === 'after' && (
                    <input
                      type="number"
                      min={1}
                      defaultValue={repeat.count ?? 5}
                      onBlur={(e) => setRepeat({ count: Math.max(1, Number(e.target.value) || 1) })}
                      className={`${dateCls} w-24`}
                      title="Number of times"
                    />
                  )}
                  {repeat?.ends === 'on' && (
                    <input
                      type="date"
                      value={repeat.until ?? ''}
                      onChange={(e) => setRepeat({ until: e.target.value || null })}
                      className={dateCls}
                    />
                  )}
                </div>
              )}
            </div>
          </Group>

          <Group label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {allTags.data?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t.id)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                    tagIds.has(t.id)
                      ? 'bg-brand text-white'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {colorClass(t.color) && (
                    <span className={`h-1.5 w-1.5 rounded-full ${tagIds.has(t.id) ? 'bg-white' : colorClass(t.color)}`} />
                  )}
                  {t.name}
                </button>
              ))}
            </div>
          </Group>

          <Group label="Estimated minutes">
            <input
              type="number"
              min={0}
              defaultValue={task.estimated_minutes ?? ''}
              onBlur={(e) => save({ estimated_minutes: e.target.value ? Number(e.target.value) : null })}
              className={dateCls}
            />
          </Group>

          <Group label={`Comments (${task.comments?.length ?? 0})`}>
            <div className="space-y-3">
              {task.comments?.map((c) => (
                <div key={c.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                  <MarkdownView content={c.body} />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{format(parseISO(c.created_at), 'MMM d, HH:mm')}</span>
                    <button onClick={() => deleteComment.mutate(c.id)} className="hover:text-red-500">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment…"
                rows={3}
                className="w-full resize-y rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand dark:border-slate-700"
              />
              <button
                disabled={!comment.trim()}
                onClick={() => {
                  if (selectedTaskId && comment.trim()) {
                    addComment.mutate({ taskId: selectedTaskId, body: comment })
                    setComment('')
                  }
                }}
                className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                Add comment
              </button>
            </div>
          </Group>
        </div>
      )}
      </aside>
    </>
  )
}

const dateCls =
  'w-full rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1 text-sm outline-none focus:border-brand'

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  )
}
