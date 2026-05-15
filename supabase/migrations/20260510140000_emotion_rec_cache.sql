-- 감정 기반 일별 추천 캐시.
-- AI 호출 비용 절감 + 같은 날 모든 사용자가 동일한 콘텐츠를 보도록 하기 위한 글로벌 캐시.
-- cache_key 형식: "YYYY-MM-DD(KST):emotion_key"  예) "2026-05-10:joyful"

CREATE TABLE IF NOT EXISTS public.emotion_rec_cache (
  cache_key text PRIMARY KEY,
  items jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 30일 지난 캐시 정리용 함수 (cron 또는 수동 호출)
CREATE OR REPLACE FUNCTION public.cleanup_emotion_rec_cache()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.emotion_rec_cache
  WHERE created_at < now() - INTERVAL '30 days';
$$;

-- RLS: 모든 인증된 사용자가 읽기 가능, 쓰기는 service_role 만
ALTER TABLE public.emotion_rec_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY emotion_rec_cache_read ON public.emotion_rec_cache
  FOR SELECT TO authenticated USING (true);

-- service_role은 RLS 우회하므로 별도 정책 불필요. 기본 GRANT만 보장.
GRANT SELECT ON public.emotion_rec_cache TO authenticated;
GRANT ALL ON public.emotion_rec_cache TO service_role;
