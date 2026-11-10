import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { BookmarkPlus, ChevronDown, ChevronRight, Flag, FolderKanban, Pencil } from 'lucide-react'
import PageShell from '../components/PageShell'
import QuickAdd from '../components/QuickAdd'
import TaskList from '../components/TaskList'
import { MarkdownEditor, MarkdownView } from '../components/Markdown'
import { useCreateTask, useProject, useSaveTemplate, useUpdateProject } from '../hooks/queries'
import ProjectEditModal from '../components/ProjectEditModal'
import { useToast } from '../store/toast'
import { showPrompt } from '../store/dialog'

const TYPE_LABEL: Record<string, string> = {
  sequential: 'Sequential',
  parallel: 'Parallel',
  single_actions: 'Single actions',
}

export default function ProjectView() {
  const { id } = useParams()
  const projectId = Number(id)
  const { data: project, isLoading } = useProject(projectId)
  const create = useCreateTask()
  const update = useUpdateProject()
  const saveTemplate = useSaveTemplate()
  const addToast = useToast((s) => s.addToast)
  const [editOpen, setEditOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [note, setNote] = useState('')
  const [noteCollapsed, setNoteCollapsed] = useState(() => localStorage.getItem('projectNoteCollapsed') === '1')

  function toggleNote() {
    setNoteCollapsed((c) => {
      localStorage.setItem('projectNoteCollapsed', c ? '0' : '1')
      return !c
    })
  }

  if (isLoading || !project) {
    return <p className="px-6 py-10 text-center text-sm text-slate-400">Loading…</p>
  }

  return (
    <PageShell
      title={project.title}
      icon={<FolderKanban />}
      subtitle={`${TYPE_LABEL[project.type]} · ${project.remaining_count ?? 0} remaining${project.archived ? ' · Archived' : ''}`}
      filter
      actions={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditOpen(true)}
            className="rounded p-1.5 text-slate-400 hover:text-brand"
            title="Edit project"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => update.mutate({ id: project.id, flagged: !project.flagged })}
            className={`rounded p-1.5 ${project.flagged ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
            title="Flag project"
          >
            <Flag size={16} fill={project.flagged ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={async () => {
              const name = await showPrompt({
                title: 'Save as template',
                label: 'Template name',
                defaultValue: project.title,
                confirmText: 'Save',
              })
              if (name) saveTemplate.mutate({ name, project_id: project.id }, { onSuccess: () => addToast({ message: 'Template saved' }) })
            }}
            className="rounded p-1.5 text-slate-400 hover:text-brand"
            title="Save as template"
          >
            <BookmarkPlus size={16} />
          </button>
        </div>
      }
      quickAdd={<QuickAdd onAdd={(p) => create.mutate({ ...p, project_id: project.id })} />}
    >
      {(project.note || editingNote) && (
        <div className="border-b border-slate-100 dark:border-slate-800 p-4">
          {editingNote ? (
            <div>
              <MarkdownEditor value={note} onChange={setNote} placeholder="Project note in Markdown…" />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    update.mutate({ id: project.id, note })
                    setEditingNote(false)
                  }}
                  className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white"
                >
                  Save
                </button>
                <button onClick={() => setEditingNote(false)} className="text-xs text-slate-400">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="group">
              <div className="flex items-center justify-between">
                <button
                  onClick={toggleNote}
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-brand"
                  title={noteCollapsed ? 'Expand note' : 'Collapse note'} aria-label={noteCollapsed ? 'Expand note' : 'Collapse note'}
                >
                  {noteCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />} Note
                </button>
                <button
                  onClick={() => {
                    setNote(project.note ?? '')
                    setEditingNote(true)
                  }}
                  className="text-slate-300 opacity-0 group-hover:opacity-100 hover:text-brand"
                  title="Edit note"
                >
                  <Pencil size={14} />
                </button>
              </div>
              {!noteCollapsed && (
                <div className="mt-2">
                  <MarkdownView content={project.note} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!project.note && !editingNote && (
        <button
          onClick={() => {
            setNote('')
            setEditingNote(true)
          }}
          className="block w-full border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-left text-xs text-slate-400 hover:text-brand"
        >
          + Add project note
        </button>
      )}
      <TaskList tasks={project.tasks ?? []} reorderable />
      {editOpen && <ProjectEditModal project={project} onClose={() => setEditOpen(false)} />}
    </PageShell>
  )
}
