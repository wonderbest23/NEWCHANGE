import { useState, useEffect, useRef, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { getDefaultPostLoginPath } from '../../lib/authPaths'
import { useUserRoles } from '../../hooks/useUserRoles'
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabaseClient'
import { useAuthSession } from '../../hooks/useAuthSession'
import { LogOut } from 'lucide-react'

const inputClass =
  'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-base text-care-ink shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500'

type Mode = 'login' | 'signup'

function safeInternalRedirect(redirect: string | null): string | null {
  if (redirect == null || redirect === '') return null
  try {
    const decoded = decodeURIComponent(redirect)
    const t = decoded.trim()
    if (!t.startsWith('/') || t.startsWith('//')) return null
    return decoded
  } catch {
    return null
  }
}

export function AuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, loading: sessionLoading } = useAuthSession()
  const {
    status: rolesStatus,
    roles,
    isRolesLoading,
    hasResolvedNoRoles,
    isError: rolesError,
  } = useUserRoles()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pendingPostLoginRef = useRef(false)
  const postLoginNavigatedRef = useRef(false)

  const configured = isSupabaseConfigured()

  useEffect(() => {
    if (!user) {
      postLoginNavigatedRef.current = false
      pendingPostLoginRef.current = false
    }
  }, [user])

  useEffect(() => {
    if (!pendingPostLoginRef.current || !configured) return
    if (!user || sessionLoading) return
    if (isRolesLoading || rolesStatus === 'roles_loading') return
    if (postLoginNavigatedRef.current) return
    postLoginNavigatedRef.current = true
    pendingPostLoginRef.current = false
    const redirectTarget = safeInternalRedirect(searchParams.get('redirect'))
    if (redirectTarget) {
      void navigate(redirectTarget, { replace: true })
    } else {
      void navigate(getDefaultPostLoginPath(roles), { replace: true })
    }
  }, [
    configured,
    user,
    sessionLoading,
    isRolesLoading,
    rolesStatus,
    roles,
    navigate,
    searchParams,
  ])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    if (!configured) return
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      const supabase = getSupabaseClient()
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (err) {
        setError(err.message)
        return
      }
      if (data.session) {
        pendingPostLoginRef.current = true
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    if (!configured) return
    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      const supabase = getSupabaseClient()
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (err) {
        setError(err.message)
        return
      }
      if (data.session) {
        pendingPostLoginRef.current = true
        return
      }
      setMessage(
        '가입 메일이 발송되었을 수 있어요. 이메일을 확인하거나(확인 링크 클릭) 비밀번호로 바로 로그인해 보세요. 프로젝트에서 이메일 확인이 꺼져 있으면 곧바로 로그인됩니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    if (!configured) return
    setError(null)
    setMessage(null)
    pendingPostLoginRef.current = false
    postLoginNavigatedRef.current = false
    const supabase = getSupabaseClient()
    const { error: err } = await supabase.auth.signOut()
    if (err) {
      setError(err.message)
    }
  }

  if (!configured) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-care-ink">로그인</h1>
        <p className="mt-2 text-sm text-rose-700">
          .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정한 뒤 dev 서버를 다시
          실행해 주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold text-care-ink">로그인 · 회원가입</h1>
      <p className="mt-2 text-sm text-care-muted">
        Supabase Auth를 사용하며, 가입 시 <code className="rounded bg-stone-100 px-1">profiles</code>는
        DB에서 자동으로 만들어집니다. 역할(
        <code className="rounded bg-stone-100 px-1">user_roles</code>
        )은 앱이 부여하지 않고 운영/관리 경로로만 붙습니다.
      </p>

      {sessionLoading && (
        <p className="mt-4 text-sm text-care-muted" aria-live="polite">
          세션 확인 중…
        </p>
      )}

      {!sessionLoading && user && (
        <Card className="mt-6 p-4">
          <p className="text-sm font-medium text-care-ink">현재 로그인됨</p>
          <p className="mt-1 text-sm text-care-muted break-all">
            {user.email ?? user.id}
          </p>
          <p className="mt-2 text-xs text-care-muted">
            (세션은 <code className="rounded bg-stone-100 px-1">getSession</code> /{' '}
            <code className="rounded bg-stone-100 px-1">onAuthStateChange</code>로 동기화)
          </p>
          <p className="mt-2 text-xs text-care-muted" aria-live="polite">
            {rolesStatus === 'roles_loading' || isRolesLoading
              ? '역할(user_roles) 불러오는 중…'
              : rolesError
                ? '역할 조회에 실패했어요. 대시보드는 그대로 이용할 수 있어요.'
                : hasResolvedNoRoles
                  ? '배정된 앱 역할이 아직 없습니다. 운영에서 부여하면 여기에 표시됩니다.'
                  : roles.length > 0
                    ? `앱 역할: ${roles.join(', ')}`
                    : null}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="primary"
              className="w-full sm:flex-1"
              disabled={isRolesLoading || rolesStatus === 'roles_loading'}
              onClick={() => void navigate(getDefaultPostLoginPath(roles))}
            >
              {isRolesLoading || rolesStatus === 'roles_loading'
                ? '역할 확인 중…'
                : '역할에 맞는 화면으로'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:flex-1"
              onClick={() => void handleSignOut()}
              disabled={submitting}
              aria-label="로그아웃"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              로그아웃
            </Button>
          </div>
        </Card>
      )}

      {!sessionLoading && !user && (
        <>
          <div
            className="mt-6 flex gap-2 rounded-lg bg-stone-100/80 p-1"
            role="tablist"
            aria-label="로그인 또는 회원가입"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === 'login'
                  ? 'bg-white text-care-ink shadow'
                  : 'text-care-muted'
              }`}
              onClick={() => {
                setMode('login')
                setError(null)
                setMessage(null)
              }}
            >
              로그인
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === 'signup'
                  ? 'bg-white text-care-ink shadow'
                  : 'text-care-muted'
              }`}
              onClick={() => {
                setMode('signup')
                setError(null)
                setMessage(null)
              }}
            >
              회원가입
            </button>
          </div>

          <Card className="mt-4 p-6">
            {mode === 'login' ? (
              <form
                className="space-y-4"
                onSubmit={(e) => void handleLogin(e)}
              >
                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-sm font-medium text-care-ink"
                  >
                    이메일
                  </label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-sm font-medium text-care-ink"
                  >
                    비밀번호
                  </label>
                  <input
                    id="auth-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    required
                    minLength={6}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  variant="primary"
                  disabled={submitting}
                >
                  {submitting ? '처리 중…' : '로그인'}
                </Button>
              </form>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => void handleSignup(e)}
              >
                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-sm font-medium text-care-ink"
                  >
                    이메일
                  </label>
                  <input
                    id="signup-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="signup-password"
                    className="block text-sm font-medium text-care-ink"
                  >
                    비밀번호
                  </label>
                  <input
                    id="signup-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    required
                    minLength={6}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  variant="primary"
                  disabled={submitting}
                >
                  {submitting ? '처리 중…' : '회원가입'}
                </Button>
              </form>
            )}

            {error && (
              <p className="mt-4 text-sm text-rose-700" role="alert">
                {error}
              </p>
            )}
            {message && !error && (
              <p className="mt-4 text-sm text-care-ink" role="status">
                {message}
              </p>
            )}
          </Card>

          <p className="mt-6 text-center text-sm text-care-muted">
            온보딩은{' '}
            <Link
              to="/onboarding"
              className="font-medium text-rose-700 hover:underline"
            >
              시작하기
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
