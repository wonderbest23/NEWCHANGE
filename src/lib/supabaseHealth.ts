import { getSupabaseClient, getSupabaseEnvGaps, isSupabaseConfigured } from './supabaseClient'

export type SupabaseHealthState =
  | {
      kind: 'not_configured'
      /** 화면에 보여줄 한 줄 요약 (요청하신 구분 문구) */
      headline: string
      /** 초보자용 설명 */
      howToFix: string
    }
  | { kind: 'ok'; message: string; sub: string }
  | {
      kind: 'error'
      headline: string
      howToFix: string
      /** 개발자 확인용 (짧게) */
      technical?: string
    }

function notConfiguredState(): SupabaseHealthState {
  const { urlMissing, keyMissing } = getSupabaseEnvGaps()

  if (urlMissing && keyMissing) {
    return {
      kind: 'not_configured',
      headline: '.env 파일을 확인하세요',
      howToFix:
        '프로젝트 루트에 .env 파일이 있고, .env.example을 복사해 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 Supabase 대시보드에 나온 값으로 채웠는지 확인하세요. 변수 이름이 정확한지(반드시 VITE_로 시작), 값 앞뒤에 공백·따옴표가 없는지도 봐 주세요. 저장 후 터미널에서 npm run dev를 다시 실행해야 반영되는 경우가 많아요.',
    }
  }
  if (urlMissing) {
    return {
      kind: 'not_configured',
      headline: 'VITE_SUPABASE_URL을 확인하세요',
      howToFix:
        'Supabase → Project Settings → API → Project URL을 복사해 .env의 VITE_SUPABASE_URL에 넣으세요. https://로 시작하는 주소인지, 앞뒤 공백·따옴표는 없는지 확인하세요.',
    }
  }
  return {
    kind: 'not_configured',
    headline: 'VITE_SUPABASE_ANON_KEY를 확인하세요',
    howToFix:
      'Supabase → Project Settings → API → Project API keys에서 anon public(공개) 키를 복사하세요. service_role(비밀) 키는 넣으면 안 됩니다. .env를 저장한 뒤 dev 서버를 다시 켰는지도 확인하세요.',
  }
}

function mapGetSessionError(err: { message: string }): {
  headline: string
  howToFix: string
} {
  const m = err.message.toLowerCase()

  if (m.includes('failed to fetch') || m.includes('network')) {
    return {
      headline: '서버에 연결할 수 없어요',
      howToFix:
        '인터넷 연결을 확인하세요. VITE_SUPABASE_URL이 Project URL과 정확히 같은지(오타, http/https), Supabase 프로젝트가 일시 중지되지 않았는지도 확인하세요.',
    }
  }
  if (
    m.includes('invalid') &&
    (m.includes('api') || m.includes('jwt') || m.includes('key') || m.includes('token'))
  ) {
    return {
      headline: 'VITE_SUPABASE_ANON_KEY를 확인하세요',
      howToFix:
        'anon public 키가 맞는지 다시 복사해 붙여 넣으세요. service_role 키를 쓰면 이런 오류가 날 수 있어요. URL은 맞는데 키만 틀린 경우가 많습니다.',
    }
  }

  return {
    headline: '접속 정보를 다시 확인하세요',
    howToFix:
      '.env의 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY가 Supabase 대시보드 → Project Settings → API에 표시된 값과 같은지, dev 서버를 재시작했는지 확인하세요.',
  }
}

/**
 * Auth API만으로 프로젝트·네트워크 가용성을 점검합니다.
 * supabase.from / RPC / Edge Function은 호출하지 않습니다.
 */
export async function checkSupabaseConnection(): Promise<SupabaseHealthState> {
  if (!isSupabaseConfigured()) {
    return notConfiguredState()
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      const mapped = mapGetSessionError(error)
      return {
        kind: 'error',
        headline: mapped.headline,
        howToFix: mapped.howToFix,
        technical: error.message,
      }
    }

    const hasSession = data.session != null
    return {
      kind: 'ok',
      message: hasSession
        ? 'Supabase에 연결되었어요. (로그인된 세션이 있어요)'
        : 'Supabase에 연결되었어요. (로그인은 아직 구현 전이라 세션이 없을 수 있어요)',
      sub: 'DB 테이블·마이그레이션 없이도, 위 상태면 프로젝트 URL·anon 키는 맞는 편이에요.',
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('VITE_SUPABASE_URL') || message.includes('VITE_SUPABASE_ANON_KEY')) {
      return {
        kind: 'not_configured',
        headline: '.env 파일을 확인하세요',
        howToFix: message,
      }
    }
    const mapped = mapGetSessionError({ message })
    return {
      kind: 'error',
      headline: mapped.headline,
      howToFix: mapped.howToFix,
      technical: message,
    }
  }
}
