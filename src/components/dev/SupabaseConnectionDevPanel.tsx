import { useEffect, useState } from 'react'
import { checkSupabaseConnection } from '../../lib/supabaseHealth'
import { getSupabaseEnvGaps } from '../../lib/supabaseClient'
import { Card } from '../common/Card'
import { StatusBadge } from '../common/StatusBadge'
import { Loader2, Plug, PlugZap, AlertCircle } from 'lucide-react'

type ViewState =
  | { status: 'loading' }
  | { status: 'ready'; result: Awaited<ReturnType<typeof checkSupabaseConnection>> }

/**
 * 개발 모드에서만 사용: Supabase 환경 변수·auth.getSession() 연결 여부 표시
 */
export function SupabaseConnectionDevPanel() {
  const [view, setView] = useState<ViewState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await checkSupabaseConnection()
      if (!cancelled) {
        setView({ status: 'ready', result })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (view.status === 'loading') {
    return (
      <Card
        className="border-dashed border-amber-300/80 bg-amber-50/50 p-4"
        data-testid="supabase-dev-status"
      >
        <div className="flex items-center gap-2 text-sm text-amber-900">
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin"
            aria-hidden
          />
          <span>Supabase 연결 확인 중…</span>
        </div>
        <p className="mt-1 text-xs text-amber-800/90">
          DEV 전용 — auth.getSession()만 사용 (DB·supabase.from 없음)
        </p>
      </Card>
    )
  }

  const { result } = view
  const envGaps = getSupabaseEnvGaps()
  const tone =
    result.kind === 'ok'
      ? 'success'
      : result.kind === 'not_configured'
        ? 'warning'
        : 'danger'

  const label =
    result.kind === 'ok'
      ? '연결 OK'
      : result.kind === 'not_configured'
        ? '미설정'
        : '오류'

  return (
    <Card
      className="border-dashed border-amber-300/80 bg-amber-50/50 p-4"
      data-testid="supabase-dev-status"
    >
      <div className="flex flex-wrap items-center gap-2">
        {result.kind === 'ok' ? (
          <PlugZap
            className="h-4 w-4 text-emerald-700"
            aria-hidden
          />
        ) : result.kind === 'not_configured' ? (
          <Plug
            className="h-4 w-4 text-amber-800"
            aria-hidden
          />
        ) : (
          <AlertCircle
            className="h-4 w-4 text-rose-700"
            aria-hidden
          />
        )}
        <span className="text-sm font-medium text-amber-950">[DEV] Supabase 연결</span>
        <StatusBadge tone={tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'danger'}>
          {label}
        </StatusBadge>
      </div>

      {result.kind === 'ok' && (
        <>
          <p className="mt-2 text-sm font-medium text-amber-950">{result.message}</p>
          <p className="mt-1 text-sm text-amber-900/90">{result.sub}</p>
        </>
      )}
      {result.kind === 'not_configured' && (
        <>
          <p className="mt-2 text-sm font-semibold text-amber-950">{result.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-900/95">{result.howToFix}</p>
          {envGaps.urlMissing && envGaps.keyMissing && (
            <p className="mt-2 rounded-md bg-amber-100/80 px-2 py-1.5 text-xs text-amber-900">
              <strong>자주 있는 원인:</strong> 창에만 URL·키가 있고 <strong>파일 저장(Cmd+S / Ctrl+S)이 안 된 상태</strong>이면, 디스크의 .env는 비어
              있어요. 터미널에서 <code className="rounded bg-white/70 px-1">cat .env</code>로 실제로 값이 붙어 있는지 확인하세요.
            </p>
          )}
        </>
      )}
      {result.kind === 'error' && (
        <>
          <p className="mt-2 text-sm font-semibold text-rose-900">{result.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-950/95">{result.howToFix}</p>
          {result.technical != null && result.technical.length > 0 && (
            <p className="mt-2 rounded-md bg-rose-50/90 px-2 py-1.5 text-xs text-rose-800/90">
              <span className="font-medium">기술 메시지: </span>
              {result.technical}
            </p>
          )}
        </>
      )}

      <p className="mt-2 text-[11px] text-amber-900/85">
        Vite가 읽는 값(번들): URL {envGaps.urlMissing ? '없음' : '있음'} · anon 키{' '}
        {envGaps.keyMissing ? '없음' : '있음'}
      </p>
      <p className="mt-3 text-xs text-amber-800/80">
        Supabase는 .env에만 접속 정보를 두면 되고, supabase/ 폴더·migration·DB 테이블은 이 단계에서
        자동으로 생기지 않아요. 이 패널은 URL·anon 키가 서버에 <strong>닿는지만</strong> 봅니다.
      </p>
    </Card>
  )
}
