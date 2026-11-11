import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { API_BASE, useWorkflowstore } from '@/store'
import { Button } from './ui/button'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate()
  const setAuth = useWorkflowstore((state) => state.setAuth)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignup = mode === 'signup'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedUser = username.trim()
    if (!trimmedUser || !password) {
      setError('Username and password are required.')
      return
    }

    setLoading(true)
    try {
      if (isSignup) {
        const signupRes = await axios.post(`${API_BASE}/signup`, {
          username: trimmedUser,
          password,
        })
        if (!signupRes.data?.success) {
          setError(signupRes.data?.message || 'Signup failed.')
          return
        }
      }

      const loginRes = await axios.post(`${API_BASE}/login`, {
        username: trimmedUser,
        password,
      })
      if (!loginRes.data?.success || !loginRes.data?.token) {
        if (isSignup) {
          navigate('/login')
          return
        }
        setError(loginRes.data?.message || 'Invalid username or password.')
        return
      }

      setAuth(loginRes.data.token, loginRes.data.username || trimmedUser)
      navigate('/')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string }
      setError(axiosErr?.response?.data?.message || axiosErr?.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          {isSignup ? 'Create an account' : 'Sign in to your account'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isSignup
            ? 'Sign up to save, manage, and run your workflows.'
            : 'Log in to access and save your workflows.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="auth-username" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Username
            </label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="auth-password" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (isSignup ? 'Creating account...' : 'Logging in...') : isSignup ? 'Sign up' : 'Login'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-indigo-600 hover:underline">
                Login
              </Link>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="font-medium text-indigo-600 hover:underline">
                Sign up
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
