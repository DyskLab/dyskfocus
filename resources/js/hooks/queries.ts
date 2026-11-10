import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, ensureCsrf, unwrap } from '../lib/api'
import type { Comment, Counts, Folder, ForecastGroups, Perspective, Project, Tag, Task } from '../lib/types'

/** Ensure CSRF cookie before any mutating request. */
async function withCsrf<T>(fn: () => Promise<T>): Promise<T> {
  await ensureCsrf()
  return fn()
}

/** Immutably patch a task (and its nested children) inside a cached tree. */
function patchTaskNode(node: Task, id: number, patch: Partial<Task>): Task {
  let t = node.id === id ? { ...node, ...patch } : node
  if (t.children && t.children.length) {
    const children = t.children.map((c) => patchTaskNode(c, id, patch))
    if (children.some((c, i) => c !== t.children![i])) t = { ...t, children }
  }
  return t
}

/**
 * Patch a task across every cached list/detail without refetching — used so a
 * just-completed task stays visible (struck through) and can be undone, instead
 * of vanishing immediately.
 */
function patchTaskEverywhere(qc: QueryClient, id: number, patch: Partial<Task>) {
  for (const q of qc.getQueryCache().getAll()) {
    const key = q.queryKey as unknown[]
    const data = q.state.data as unknown
    if (data == null) continue
    const k0 = key[0]
    // These views hold projects (or a grouped object), not task arrays.
    if (k0 === 'view' && (key[1] === 'review' || key[1] === 'by-project')) continue

    if (k0 === 'view' && key[1] === 'forecast' && typeof data === 'object') {
      const groups = data as Record<string, Task[]>
      const next: Record<string, Task[]> = {}
      for (const kk of Object.keys(groups)) next[kk] = groups[kk].map((t) => patchTaskNode(t, id, patch))
      qc.setQueryData(key, next)
    } else if (
      (k0 === 'view' || k0 === 'tasks' || k0 === 'perspective-tasks' || k0 === 'search' || k0 === 'due-reminders') &&
      Array.isArray(data)
    ) {
      qc.setQueryData(key, (data as Task[]).map((t) => patchTaskNode(t, id, patch)))
    } else if (k0 === 'project' && data && Array.isArray((data as { tasks?: Task[] }).tasks)) {
      const project = data as { tasks: Task[] }
      qc.setQueryData(key, { ...project, tasks: project.tasks.map((t) => patchTaskNode(t, id, patch)) })
    } else if (k0 === 'task' && data && typeof data === 'object' && 'title' in (data as object)) {
      qc.setQueryData(key, patchTaskNode(data as Task, id, patch))
    }
  }
}

/** Invalidate everything that can change when a task is mutated. */
function invalidateTaskData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['tasks'] })
  qc.invalidateQueries({ queryKey: ['task'] })
  qc.invalidateQueries({ queryKey: ['view'] })
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: ['project'] })
  qc.invalidateQueries({ queryKey: ['perspective-tasks'] })
  qc.invalidateQueries({ queryKey: ['tags'] })
  qc.invalidateQueries({ queryKey: ['search'] })
  qc.invalidateQueries({ queryKey: ['counts'] })
}

/* -------------------------------------------------------------------------- */
/*  Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export function useTasks(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: async () => unwrap<Task[]>((await api.get('/tasks', { params })).data),
  })
}

export function useTask(id: number | null) {
  return useQuery({
    queryKey: ['task', id],
    enabled: id != null,
    queryFn: async () => unwrap<Task>((await api.get(`/tasks/${id}`)).data),
  })
}

export function useTaskSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    enabled: q.trim().length > 0,
    queryFn: async () => unwrap<Task[]>((await api.get('/tasks', { params: { search: q } })).data),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<Task> & { tag_ids?: number[] }) =>
      withCsrf(async () => unwrap<Task>((await api.post('/tasks', payload)).data)),
    onSuccess: () => invalidateTaskData(qc),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Partial<Task> & { tag_ids?: number[] }) =>
      withCsrf(async () => unwrap<Task>((await api.put(`/tasks/${id}`, payload)).data)),
    onSuccess: () => invalidateTaskData(qc),
  })
}

export function useCompleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      withCsrf(async () => unwrap<Task>((await api.post(`/tasks/${id}/complete`, { completed })).data)),
    // Optimistically strike the task through in place (keep it visible so it can
    // be undone). It only leaves the list on the next refetch (navigation/refresh).
    onMutate: async ({ id, completed }) => {
      // Stop in-flight refetches from overwriting the optimistic patch.
      await qc.cancelQueries({ predicate: (q) => q.queryKey[0] !== 'counts' })
      patchTaskEverywhere(qc, id, {
        status: completed ? 'done' : 'todo',
        completed_at: completed ? new Date().toISOString() : null,
      })
    },
    onError: () => invalidateTaskData(qc),
    onSuccess: (task, { completed }) => {
      // A completed repeating task spawned its next occurrence — show it now.
      if (completed && task?.repeat_rule) invalidateTaskData(qc)
      else qc.invalidateQueries({ queryKey: ['counts'] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => api.delete(`/tasks/${id}`)),
    onSuccess: () => invalidateTaskData(qc),
  })
}

export function useRestoreTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => api.post(`/tasks/${id}/restore`)),
    onSuccess: () => invalidateTaskData(qc),
  })
}

export function useBulkTasks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { ids: number[]; action: string; value?: unknown }) =>
      withCsrf(async () => api.post('/tasks/bulk', payload)),
    onSuccess: () => invalidateTaskData(qc),
  })
}

export function useReorderTasks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: { id: number; position: number; project_id?: number | null; parent_id?: number | null }[]) =>
      withCsrf(async () => api.post('/tasks/reorder', { items })),
    onSuccess: () => invalidateTaskData(qc),
  })
}

/* -------------------------------------------------------------------------- */
/*  Views (built-in perspectives)                                             */
/* -------------------------------------------------------------------------- */

export function useView(name: 'inbox' | 'today' | 'flagged' | 'completed', enabled = true) {
  return useQuery({
    queryKey: ['view', name],
    enabled,
    queryFn: async () => unwrap<Task[]>((await api.get(`/views/${name}`)).data),
  })
}

export function useForecast(days = 7) {
  return useQuery({
    queryKey: ['view', 'forecast', days],
    queryFn: async () => unwrap<ForecastGroups>((await api.get('/views/forecast', { params: { days } })).data),
  })
}

export function useReviewProjects() {
  return useQuery({
    queryKey: ['view', 'review'],
    queryFn: async () => unwrap<Project[]>((await api.get('/views/review')).data),
  })
}

export function useByProject() {
  return useQuery({
    queryKey: ['view', 'by-project'],
    queryFn: async () => {
      const { data } = await api.get('/views/by-project')
      return { inbox: data.inbox as Task[], projects: data.projects as Project[] }
    },
  })
}

export function useCounts() {
  return useQuery({
    queryKey: ['counts'],
    queryFn: async () => unwrap<Counts>((await api.get('/views/counts')).data),
    refetchInterval: 60_000,
  })
}

/* -------------------------------------------------------------------------- */
/*  Projects & Folders                                                        */
/* -------------------------------------------------------------------------- */

export function useProjects(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: async () => unwrap<Project[]>((await api.get('/projects', { params })).data),
  })
}

export function useProject(id: number | null) {
  return useQuery({
    queryKey: ['project', id],
    enabled: id != null,
    queryFn: async () => unwrap<Project>((await api.get(`/projects/${id}`)).data),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<Project>) =>
      withCsrf(async () => unwrap<Project>((await api.post('/projects', payload)).data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useReorderProjects() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => withCsrf(async () => api.post('/projects/reorder', { ids })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useArchiveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      withCsrf(async () =>
        unwrap<Project>((await api.post(`/projects/${id}/${archived ? 'archive' : 'unarchive'}`)).data)
      ),
    // Archiving hides/shows the project's tasks in the built-in views and counts.
    onSuccess: () => invalidateTaskData(qc),
  })
}

export function useReorderFolders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => withCsrf(async () => api.post('/folders/reorder', { ids })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Partial<Project>) =>
      withCsrf(async () => unwrap<Project>((await api.put(`/projects/${id}`, payload)).data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['view'] })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => api.delete(`/projects/${id}`)),
    // Its tasks move/disappear across every view, so refresh all task data.
    onSuccess: () => invalidateTaskData(qc),
  })
}

export function useReviewProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => unwrap<Project>((await api.post(`/projects/${id}/review`)).data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['view', 'review'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['counts'] })
    },
  })
}

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: async () => unwrap<Folder[]>((await api.get('/folders')).data),
  })
}

export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => withCsrf(async () => unwrap<Folder>((await api.post('/folders', { name })).data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  })
}

export function useUpdateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Partial<Folder>) =>
      withCsrf(async () => unwrap<Folder>((await api.put(`/folders/${id}`, payload)).data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  })
}

export function useDeleteFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => api.delete(`/folders/${id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

/* -------------------------------------------------------------------------- */
/*  Templates                                                                  */
/* -------------------------------------------------------------------------- */

export interface TemplateSummary {
  id: number
  name: string
  created_at: string
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates')).data.data as TemplateSummary[],
  })
}

export function useSaveTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; project_id: number }) =>
      withCsrf(async () => api.post('/templates', payload)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useApplyTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: number; title?: string }) =>
      withCsrf(async () => unwrap<Project>((await api.post(`/templates/${id}/apply`, { title })).data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => api.delete(`/templates/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

/* -------------------------------------------------------------------------- */
/*  Tags                                                                       */
/* -------------------------------------------------------------------------- */

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: async () => unwrap<Tag[]>((await api.get('/tags')).data),
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => withCsrf(async () => unwrap<Tag>((await api.post('/tags', { name })).data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Partial<Tag>) =>
      withCsrf(async () => unwrap<Tag>((await api.put(`/tags/${id}`, payload)).data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['view'] })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['task'] })
    },
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => api.delete(`/tags/${id}`)),
    // Drop the deleted tag's chips from every cached task list.
    onSuccess: () => invalidateTaskData(qc),
  })
}

/* -------------------------------------------------------------------------- */
/*  Perspectives                                                               */
/* -------------------------------------------------------------------------- */

export function usePerspectives() {
  return useQuery({
    queryKey: ['perspectives'],
    queryFn: async () => unwrap<Perspective[]>((await api.get('/perspectives')).data),
  })
}

export function usePerspectiveTasks(id: number | null) {
  return useQuery({
    queryKey: ['perspective-tasks', id],
    enabled: id != null,
    queryFn: async () => unwrap<Task[]>((await api.get(`/perspectives/${id}/tasks`)).data),
  })
}

export function useCreatePerspective() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<Perspective>) =>
      withCsrf(async () => unwrap<Perspective>((await api.post('/perspectives', payload)).data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perspectives'] }),
  })
}

export function useUpdatePerspective() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Partial<Perspective>) =>
      withCsrf(async () => unwrap<Perspective>((await api.put(`/perspectives/${id}`, payload)).data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perspectives'] })
      qc.invalidateQueries({ queryKey: ['perspective-tasks'] })
    },
  })
}

export function useDeletePerspective() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => api.delete(`/perspectives/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perspectives'] }),
  })
}

/* -------------------------------------------------------------------------- */
/*  Comments                                                                   */
/* -------------------------------------------------------------------------- */

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: number; body: string }) =>
      withCsrf(async () => unwrap<Comment>((await api.post(`/tasks/${taskId}/comments`, { body })).data)),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['task', vars.taskId] }),
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => withCsrf(async () => api.delete(`/comments/${id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task'] }),
  })
}
