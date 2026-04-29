import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase는 브라우저에서 **anon public** 키만 사용합니다.
 * service_role 키는 서버/Edge Function 전용이며 이 파일에 절대 넣지 않습니다.
 */

let client: SupabaseClient | null = null

function readUrl(): string {
  const v = import.meta.env.VITE_SUPABASE_URL
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(
      '[Supabase] VITE_SUPABASE_URL이 없거나 비어 있습니다. 루트에 .env를 만들고 .env.example을 참고해 프로젝트 URL을 넣으세요.',
    )
  }
  return v.trim()
}

function readAnonKey(): string {
  const v = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(
      '[Supabase] VITE_SUPABASE_ANON_KEY가 없거나 비어 있습니다. 루트에 .env를 만들고 .env.example을 참고해 anon public 키를 넣으세요. (service_role 키는 사용하지 않습니다.)',
    )
  }
  return v.trim()
}

function isEmptyEnvValue(v: unknown): boolean {
  return typeof v !== 'string' || v.trim() === ''
}

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return !isEmptyEnvValue(url) && !isEmptyEnvValue(key)
}

/** .env 누락 범위 — health UI에서 문구를 나눌 때 사용 (supabase.from 사용 안 함) */
export function getSupabaseEnvGaps(): {
  urlMissing: boolean
  keyMissing: boolean
} {
  return {
    urlMissing: isEmptyEnvValue(import.meta.env.VITE_SUPABASE_URL),
    keyMissing: isEmptyEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY),
  }
}

/**
 * 환경 변수가 올바를 때만 Supabase 클라이언트를 반환합니다.
 * 미설정 시 위 메시지대로 throw — 호출부는 `isSupabaseConfigured()`로 먼저 분기하세요.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      '[Supabase] VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 모두 설정한 뒤 getSupabaseClient()를 호출하세요.',
    )
  }
  if (!client) {
    client = createClient(readUrl(), readAnonKey(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
