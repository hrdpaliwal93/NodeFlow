import { Link, useNavigate } from 'react-router-dom'
import { useWorkflowstore } from '@/store'
import { Button } from './ui/button'

export default function Navbar() {
  const navigate = useNavigate()
  const token = useWorkflowstore((state) => state.token)
  const username = useWorkflowstore((state) => state.username)
  const logout = useWorkflowstore((state) => state.logout)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="text-xl font-bold tracking-tight text-slate-900"
          >
            WorkflowAutomation
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Workflows
            </Link>
            <Link
              to="/create-workflow"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Editor
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {token ? (
            <>
              {username && (
                <span className="text-sm font-medium text-slate-700">
                  {username}
                </span>
              )}
              <Button variant="outline" onClick={handleLogout}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
