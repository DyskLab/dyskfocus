import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import type { Perspective } from '../lib/types'
import { useCreatePerspective, useProjects, useTags, useUpdatePerspective } from '../hooks/queries'

interface Rules {
  availability?: string
  flagged?: boolean
  inbox?: boolean
  due_within_days?: number
  min_priority?: string
  search?: string
  tag_ids?: number[]
  project_ids?: number[]
}

export default function PerspectiveEditor({
  perspective,
  onClose,
}: {
  perspective?: Perspective | null
  onClose: () => void
}) {
  const tags = useTags()
  const projects = useProjects({ status: 'active' })
  const create = useCreatePerspective()
  const update = useUpdatePerspective()
  const navigate = useNavigate()

  const initial = (perspective?.filter_rules as Rules | undefined) ?? {}
  const [name, setName] = useState(perspective?.name ?? '')
  const [availability, setAvailability] = useState(initial.availability ?? 'available')
  const [flagged, setFlagged] = useState(!!initial.flagged)
  const [inbox, setInbox] = useState(!!initial.inbox)
  const [dueWithin, setDueWithin] = useState(initial.due_within_days != null ? String(initial.due_within_days) : '')
  const [minPriority, setMinPriority] = useState(initial.min_priority ?? '')
  const [search, setSearch] = useState(initial.search ?? '')
  const [tagIds, setTagIds] = useState<number[]>(initial.tag_ids ?? [])
  const [projectIds, setProjectIds] = useState<number[]>(initial.project_ids ?? [])

  const busy = create.isPending || update.isPending
  const isEdit = !!perspective

  function toggleTag(id: number) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  function toggleProject(id: number) {
    setProjectIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  function save() {
    if (!name.trim()) return
    const filter_rules: Record<string, unknown> = { availability }
    if (flagged) filter_rules.flagged = true
    if (inbox) filter_rules.inbox = true
    if (dueWithin.trim()) filter_rules.due_within_days = Math.max(0, Number(dueWithin) || 0)
    if (minPriority && minPriority !== 'none') filter_rules.min_priority = minPriority
    if (search.trim()) filter_rules.search = search.trim()
    if (tagIds.length) filter_rules.tag_ids = tagIds
    if (projectIds.length) filter_rules.project_ids = projectIds

    if (isEdit) {
      update.mutate(
        { id: perspective!.id, name: name.trim(), filter_rules },
        { onSuccess: onClose }
      )
    } else {
      create.mutate(
        { name: name.trim(), filter_rules },
        {
          onSuccess: (p) => {
            onClose()
            navigate(`/perspective/${p.id}`)
          },
        }
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:max-w-md md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold">{isEdit ? 'Edit perspective' : 'New perspective'}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work — this week"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Availability">
              <select value={availability} onChange={(e) => setAvailability(e.target.value)} className={inputCls}>
                <option value="available">Available</option>
                <option value="remaining">Remaining</option>
                <option value="completed">Completed</option>
                <option value="all">All</option>
              </select>
            </Field>
            <Field label="Due within (days)">
              <input
                type="number"
                min={0}
                value={dueWithin}
                onChange={(e) => setDueWithin(e.target.value)}
                placeholder="any"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="flex gap-5">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Flagged only
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={inbox} onChange={(e) => setInbox(e.target.checked)} /> Inbox only
            </label>
          </div>

          <Field label="Minimum priority">
            <select value={minPriority} onChange={(e) => setMinPriority(e.target.value)} className={inputCls}>
              <option value="">Any</option>
              <option value="low">Low or higher</option>
              <option value="medium">Medium or higher</option>
              <option value="high">High only</option>
            </select>
          </Field>

          <Field label="Search text">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="optional" className={inputCls} />
          </Field>

          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {tags.data?.length ? (
                tags.data.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      tagIds.includes(t.id)
                        ? 'bg-brand text-white'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    {t.name}
                  </button>
                ))
              ) : (
                <span className="text-xs text-slate-400">No tags yet</span>
              )}
            </div>
          </Field>

          <Field label="Projects">
            <div className="flex flex-wrap gap-1.5">
              {projects.data?.length ? (
                projects.data.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleProject(p.id)}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      projectIds.includes(p.id)
                        ? 'bg-brand text-white'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    {p.title}
                  </button>
                ))
              ) : (
                <span className="text-xs text-slate-400">No projects yet</span>
              )}
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
