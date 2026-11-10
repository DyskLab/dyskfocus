import { useNavigate } from 'react-router-dom'
import { Trash2, X } from 'lucide-react'
import { useApplyTemplate, useDeleteTemplate, useTemplates } from '../hooks/queries'

export default function TemplatesModal({ onClose }: { onClose: () => void }) {
  const templates = useTemplates()
  const apply = useApplyTemplate()
  const del = useDeleteTemplate()
  const navigate = useNavigate()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl md:w-full md:max-w-md md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold">Project templates</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {templates.data?.length ? (
            <ul className="space-y-1">
              {templates.data.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span className="flex-1 truncate text-sm">{t.name}</span>
                  <button
                    onClick={() =>
                      apply.mutate(
                        { id: t.id },
                        {
                          onSuccess: (proj) => {
                            onClose()
                            navigate(`/project/${proj.id}`)
                          },
                        }
                      )
                    }
                    className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                  >
                    New project
                  </button>
                  <button onClick={() => del.mutate(t.id)} className="text-slate-400 hover:text-red-500" title="Delete template">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              No templates yet. Open a project and choose “Save as template”.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
