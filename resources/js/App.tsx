import { lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { api } from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Setup, { type SetupStatus } from './pages/Setup'

// Route-level code splitting: each page is fetched on demand.
const InboxView = lazy(() => import('./pages/BuiltinViews').then((m) => ({ default: m.InboxView })))
const TodayView = lazy(() => import('./pages/BuiltinViews').then((m) => ({ default: m.TodayView })))
const FlaggedView = lazy(() => import('./pages/BuiltinViews').then((m) => ({ default: m.FlaggedView })))
const ForecastView = lazy(() => import('./pages/ForecastView'))
const ReviewView = lazy(() => import('./pages/ReviewView'))
const ProjectView = lazy(() => import('./pages/ProjectView'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const TagView = lazy(() => import('./pages/TagView'))
const PerspectiveView = lazy(() => import('./pages/PerspectiveView'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const SearchView = lazy(() => import('./pages/SearchView'))
const CalendarView = lazy(() => import('./pages/CalendarView'))
const CompletedView = lazy(() => import('./pages/CompletedView'))
const ByProjectView = lazy(() => import('./pages/ByProjectView'))
const FolderView = lazy(() => import('./pages/FolderView'))

function Splash() {
  return (
    <div className="flex h-full items-center justify-center text-slate-400">
      <div className="animate-pulse text-sm">Loading DyskFocus…</div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [setupLoading, setSetupLoading] = useState(true)

  useEffect(() => {
    api
      .get<SetupStatus>('/setup/status')
      .then(({ data }) => setSetup(data))
      .catch(() => setSetup({ migrated: false, has_users: false, needs_setup: true }))
      .finally(() => setSetupLoading(false))
  }, [])

  if (loading || setupLoading) return <Splash />

  // Fresh install (no DB or no account): run the first-run wizard, nothing else.
  if (setup?.needs_setup && !user) return <Setup status={setup} />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login allowRegister={setup?.registration_open ?? false} />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="/search" element={<SearchView />} />
        <Route path="/inbox" element={<InboxView />} />
        <Route path="/today" element={<TodayView />} />
        <Route path="/forecast" element={<ForecastView />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/flagged" element={<FlaggedView />} />
        <Route path="/review" element={<ReviewView />} />
        <Route path="/completed" element={<CompletedView />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/by-project" element={<ByProjectView />} />
        <Route path="/project/:id" element={<ProjectView />} />
        <Route path="/folder/:id" element={<FolderView />} />
        <Route path="/tag/:id" element={<TagView />} />
        <Route path="/perspective/:id" element={<PerspectiveView />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
