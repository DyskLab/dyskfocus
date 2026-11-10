import { Suspense, lazy } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { useUI } from '../store/ui'
import { EditorSkeleton } from './Skeleton'

// The Markdown editor (CodeMirror-based) is the single heaviest dependency, so
// it is split into its own chunk and only loaded when an editor is shown.
const MDEditor = lazy(() => import('@uiw/react-md-editor'))

export function MarkdownView({ content }: { content?: string | null }) {
  if (!content || !content.trim()) return null
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-slate-800 prose-pre:text-slate-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links in notes open in a new tab instead of navigating away from the app.
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function MarkdownEditor({
  value,
  onChange,
  height = 200,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  height?: number
  placeholder?: string
}) {
  const theme = useUI((s) => s.theme)
  return (
    <div data-color-mode={theme} className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
      <Suspense fallback={<EditorSkeleton height={height} />}>
        <MDEditor
          value={value}
          onChange={(v) => onChange(v ?? '')}
          height={height}
          preview="edit"
          textareaProps={{ placeholder }}
          // The editor's Live/Preview modes render raw HTML — sanitize it, since
          // notes can arrive from imports, templates or other devices.
          previewOptions={{ rehypePlugins: [[rehypeSanitize]] }}
        />
      </Suspense>
    </div>
  )
}
