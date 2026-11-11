import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Plus, Trash2, ExternalLink, Workflow } from 'lucide-react'
import { API_BASE, useWorkflowstore } from '@/store'
import { Button } from './ui/button'

interface SavedWorkflow {
  _id: string
  title: string
  nodes?: unknown[]
  edges?: unknown[]
  updatedAt?: string
  createdAt?: string
}

function getErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  return e?.response?.data?.message || e?.message || fallback
}

export default function Home() {
  const navigate = useNavigate()
  const token = useWorkflowstore((state) => state.token)
  const logout = useWorkflowstore((state) => state.logout)
  const clearcanvas = useWorkflowstore((state) => state.clearcanvas)
  const deleteWorkflow = useWorkflowstore((state) => state.deleteWorkflow)

  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    axios
      .get(`${API_BASE}/workflows`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (cancelled) return
        if (res.data?.success) {
          setWorkflows(Array.isArray(res.data.workflows) ? res.data.workflows : [])
          setError(null)
        } else {
          setError(res.data?.message || 'Failed to load workflows')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const e = err as { response?: { status?: number } }
        if (e?.response?.status === 401) {
          logout()
          setError('Session expired. Please log in again.')
        } else {
          setError(getErrorMessage(err, 'Failed to load workflows'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token, logout])

  const handleCreateNew = () => {
    clearcanvas()
    navigate('/create-workflow')
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      await deleteWorkflow(id)
      setWorkflows((prev) => prev.filter((wf) => wf._id !== id))
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete workflow'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Workflows</h1>
            <p className="mt-1 text-sm text-slate-600">
              Build, save, and execute automated multi-step AI and API workflows.
            </p>
          </div>
          <Button onClick={handleCreateNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Create Workflow
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!token ? (
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Workflow className="mx-auto h-10 w-10 text-indigo-600" />
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              Sign in to view your saved workflows
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              You can also jump straight into the editor to build and run workflows locally.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Sign up
              </Link>
              <Button variant="outline" onClick={handleCreateNew}>
                Try Editor
              </Button>
            </div>
          </div>
        ) : loading ? (
          <p className="mt-8 text-sm text-slate-600">Loading saved workflows...</p>
        ) : workflows.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-800">No saved workflows yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Create your first workflow and save it to access it from anywhere.
            </p>
            <Button onClick={handleCreateNew} className="mt-4">
              Create First Workflow
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <div
                key={wf._id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
              >
                <div>
                  <h3 className="truncate text-base font-semibold text-slate-900">
                    {wf.title || 'Untitled Workflow'}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {wf.nodes?.length ?? 0} nodes &middot; {wf.edges?.length ?? 0} edges
                  </p>
                  {wf.updatedAt && (
                    <p className="mt-1 text-xs text-slate-400">
                      Updated {new Date(wf.updatedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/create-workflow?id=${wf._id}`)}
                    className="gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingId === wf._id}
                    onClick={() => void handleDelete(wf._id)}
                    className="gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === wf._id ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
