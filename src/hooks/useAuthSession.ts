import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient'

type AuthSessionState = {
  session: Session | null
  loading: boolean
}

/**
 * Supabase Auth 세션 — getSession 초기화 + onAuthStateChange 구독.
 * public.profiles 행은 DB 트리거(003)에서 auth.users 기준으로 생성.
 */
export function useAuthSession(): AuthSessionState & { user: Session['user'] | null } {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(() => isSupabaseConfigured())

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return
    }

    const supabase = getSupabaseClient()
    let cancelled = false

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) {
        setSession(s)
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) {
        setSession(next)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return { session, user: session?.user ?? null, loading }
}
